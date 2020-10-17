module.exports = function(octokit, opts) {
  return new Promise(async (resolve, reject) => {
    // Up front validation
    try {
      for (let req of ["owner", "repo", "branch"]) {
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
        changes,
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
              repo,
            })
          ).data.default_branch;
        }

        baseTree = await loadRef(octokit, owner, repo, base);

        if (!baseTree) {
          return reject(`The branch '${base}' doesn't exist`);
        }
      }

      // Create blobs
      for (let change of changes) {
        let message = change.message;
        if (!message) {
          return reject(`changes[].message is a required parameter`);
        }
        if (!change.files || Object.keys(change.files).length === 0) {
          return reject(`changes[].files is a required parameter`);
        }

        const treeItems = [];
        for (let fileName in change.files) {
          let properties = change.files[fileName] || "";

          let contents = properties.contents || properties;
          let mode = properties.mode || "100644";
          let type = properties.type || "blob";

          if (!contents) {
            return reject(`No file contents provided for ${fileName}`);
          }

          let fileSha;
          if (type == "commit") {
            fileSha = contents;
          } else {
            let file = (
              await octokit.git.createBlob({
                owner,
                repo,
                content: Buffer.from(contents).toString("base64"),
                encoding: "base64",
              })
            ).data;
            fileSha = file.sha;
          }

          treeItems.push({
            path: fileName,
            sha: fileSha,
            mode: mode,
            type: type,
          });
        }

        // Add those blobs to a tree
        let tree = (
          await octokit.git.createTree({
            owner,
            repo,
            tree: treeItems,
            base_tree: baseTree,
          })
        ).data;

        // Create a commit that points to that tree
        let commit = (
          await octokit.git.createCommit({
            owner,
            repo,
            message,
            tree: tree.sha,
            parents: [baseTree],
          })
        ).data;

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

      const branch = (
        await octokit.git[action]({
          owner,
          repo,
          force: true,
          ref: `${updateRefBase}heads/${branchName}`,
          sha: baseTree,
        })
      ).data;

      // Return the new branch name so that we can use it later
      // e.g. to create a pull request
      return resolve(branchName);
    } catch (e) {
      return reject(e);
    }
  });
};

async function loadRef(octokit, owner, repo, ref) {
  try {
    return (
      await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${ref}`,
      })
    ).data.object.sha;
  } catch (e) {
    //console.log(e);
  }
}
