module.exports = function (octokit, opts) {
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

        if ((!change.files || Object.keys(change.files).length === 0) && change.filesToDelete.length === 0) {
          return reject(`either changes[].files or changes[].filesToDelete are required`);
        }

        const treeItems = [];
        for (const fileName in change.files) {
          const properties = change.files[fileName] || "";

          const contents = properties.contents || properties;
          const mode = properties.mode || "100644";
          const type = properties.type || "blob";

          if (!contents) {
            return reject(`No file contents provided for ${fileName}`);
          }

          const fileSha = await createBlob(octokit, owner, repo, contents, type);

          treeItems.push({
            path: fileName,
            sha: fileSha,
            mode: mode,
            type: type
          });
        }

        if (Array.isArray(change.filesToDelete)) {
          for (const fileName of change.filesToDelete) {
            treeItems.push({
              path: fileName,
              sha: null, // sha as null implies that the file should be deleted
              mode: "100644",
              type: "commit"
            });
          }
        }

        // Add those blobs to a tree
        let tree;
        try {
          tree = await createTree(octokit, owner, repo, treeItems, baseTree);
        } catch (e) {
          const retryFlag = change.retryOnDeleteFailure || false;
          // discard deletions if one of the files could not be found
          if (retryFlag) {
            change.filesToDelete.forEach(() => treeItems.pop());
            tree = await createTree(octokit, owner, repo, treeItems, baseTree);
          } else {
            return reject('At least one file set for deletion could not be found in repo');
          }
        }

        // Create a commit that points to that tree
        const commit = await createCommit(octokit, owner, repo, message, tree, baseTree);

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

async function createCommit(octokit, owner, repo, message, tree, baseTree) {
  return (
    await octokit.git.createCommit({
      owner,
      repo,
      message,
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
    })
    console.log(x);
    return x.data.object.sha
  } catch (e) {
    // console.log(e);
  }
}
