module.exports = function(octokit, opts) {
  return new Promise(async (resolve, reject) => {
    // Up front validation
    try {
      for (const req of ["owner", "repo", "branch"]) {
        if (!opts[req]) {
          return reject(`'${req}' is a required parameter`);
        }
      }

      if (!opts.changes || !opts.changes.length) {
        return reject("No changes provided");
      }

      // Destructuring for easier access later
      let {
        owner,
        repo,
        base,
        branch: branchName,
        createBranch,
        committer,
        author,
        changes
      } = opts;

      let branchAlreadyExists = true;
      let baseTree;

      // Does the target branch already exist?
      baseTree = await loadRef(octokit, owner, repo, branchName);
      if (!baseTree) {
        if (!createBranch) {
          return reject(
            `The branch '${branchName}' doesn't exist and createBranch is 'false'`
          );
        }

        branchAlreadyExists = false;

        // If not we use the base branch. If not provided, use the
        // default from the repo
        if (!base) {
          // Work out the default branch
          base = (
            await octokit.repos.get({
              owner,
              repo
            })
          ).data.default_branch;
        }

        baseTree = await loadRef(octokit, owner, repo, base);

        if (!baseTree) {
          return reject(`The branch '${base}' doesn't exist`);
        }
      }

      // Create blobs
      for (const change of changes) {
        const message = change.message;
        if (!message) {
          return reject(`changes[].message is a required parameter`);
        }

        const hasFiles = change.files && Object.keys(change.files).length > 0;

        const hasFilesToDelete =
          Array.isArray(change.filesToDelete) &&
          change.filesToDelete.length > 0;

        if (!hasFiles && !hasFilesToDelete) {
          return reject(
            `either changes[].files or changes[].filesToDelete are required`
          );
        }

        const treeItems = [];
        // Handle file deletions
        if (hasFilesToDelete) {
          for (const fileName of change.filesToDelete) {
            const exists = await fileExistsInRepo(
              octokit,
              owner,
              repo,
              fileName,
              baseTree
            );

            // If it doesn't exist, and we're not ignoring missing files
            // reject the promise
            if (!exists && !change.ignoreDeletionFailures) {
              return reject(
                `The file ${fileName} could not be found in the repo`
              );
            }

            // At this point it either exists, or we're ignoring failures
            if (exists) {
              treeItems.push({
                path: fileName,
                sha: null, // sha as null implies that the file should be deleted
                mode: "100644",
                type: "commit"
              });
            }
          }
        }

        for (const fileName in change.files) {
          const properties = change.files[fileName] || "";

          const contents = properties.contents || properties;
          const mode = properties.mode || "100644";
          const type = properties.type || "blob";

          if (!contents) {
            return reject(`No file contents provided for ${fileName}`);
          }

          const fileSha = await createBlob(
            octokit,
            owner,
            repo,
            contents,
            type
          );

          treeItems.push({
            path: fileName,
            sha: fileSha,
            mode: mode,
            type: type
          });
        }

        // no need to issue further requests if there are no updates, creations and deletions
        if (treeItems.length === 0) {
          continue;
        }

        // Add those blobs to a tree
        const tree = await createTree(
          octokit,
          owner,
          repo,
          treeItems,
          baseTree
        );

        // Create a commit that points to that tree
        const commit = await createCommit(
          octokit,
          owner,
          repo,
          committer,
          author,
          message,
          tree,
          baseTree
        );

        // Update the base tree if we have another commit to make
        baseTree = commit.sha;
      }

      // Create a ref that points to that tree
      let action = "createRef";
      let updateRefBase = "refs/";

      // Or if it already exists, we'll update that existing ref
      if (branchAlreadyExists) {
        action = "updateRef";
        updateRefBase = "";
      }

      await octokit.git[action]({
        owner,
        repo,
        force: true,
        ref: `${updateRefBase}heads/${branchName}`,
        sha: baseTree
      });

      // Return the new branch name so that we can use it later
      // e.g. to create a pull request
      return resolve(branchName);
    } catch (e) {
      return reject(e);
    }
  });
};

async function fileExistsInRepo(octokit, owner, repo, path, branch) {
  try {
    await octokit.repos.getContent({
      method: "HEAD",
      owner,
      repo,
      path,
      ref: branch
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function createCommit(
  octokit,
  owner,
  repo,
  committer,
  author,
  message,
  tree,
  baseTree
) {
  return (
    await octokit.git.createCommit({
      owner,
      repo,
      message,
      committer,
      author,
      tree: tree.sha,
      parents: [baseTree]
    })
  ).data;
}

async function createTree(octokit, owner, repo, treeItems, baseTree) {
  return (
    await octokit.git.createTree({
      owner,
      repo,
      tree: treeItems,
      base_tree: baseTree
    })
  ).data;
}

async function createBlob(octokit, owner, repo, contents, type) {
  if (type === "commit") {
    return contents;
  } else {
    const file = (
      await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(contents).toString("base64"),
        encoding: "base64"
      })
    ).data;
    return file.sha;
  }
}

async function loadRef(octokit, owner, repo, ref) {
  try {
    const x = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${ref}`
    });
    return x.data.object.sha;
  } catch (e) {
    // console.log(e);
  }
}
