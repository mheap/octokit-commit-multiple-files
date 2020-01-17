module.exports = function(octokit, opts) {
  return new Promise(async (resolve, reject) => {
    // Up front validation
    try {
      for (let req of ["owner", "repo", "branch", "message"]) {
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
        message
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
      const treeItems = [];
      for (let change of changes) {
        if (!change.contents) {
          return reject(
            `No file contents provided for ${change.path || "Un-named file"}`
          );
        }

        if (!change.path) {
          return reject(
            `No file path provided for the following contents: ${change.contents.substr(
              0,
              30
            )}...`
          );
        }

        let file = (
          await octokit.git.createBlob({
            owner,
            repo,
            content: Buffer.from(change.contents).toString("base64"),
            encoding: "base64"
          })
        ).data;

        treeItems.push({
          path: change.path,
          sha: file.sha,
          mode: "100644",
          type: "blob"
        });
      }

      // Add those blobs to a tree
      let tree = (
        await octokit.git.createTree({
          owner,
          repo,
          tree: treeItems,
          base_tree: baseTree
        })
      ).data;

      // Create a commit that points to that tree
      let commit = (
        await octokit.git.createCommit({
          owner,
          repo,
          message,
          tree: tree.sha,
          parents: [baseTree]
        })
      ).data;

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
          sha: commit.sha
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
        ref: `heads/${ref}`
      })
    ).data.object.sha;
  } catch (e) {
    //console.log(e);
  }
}
