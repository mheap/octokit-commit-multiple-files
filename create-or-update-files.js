const isBase64 = require("is-base64");

/**
 * @typedef {Object} Options
 * @property {Change[]} changes
 * @property {number} batchSize
 * @property {string} owner
 * @property {string} repo
 * @property {string} base
 * @property {string} branch
 * @property {boolean} createBranch
 * @property {GitUser} committer
 * @property {GitUser} author
 */

/**
 * @typedef {Object} GitUser
 * @property {string} name
 * @property {string} email
 * @property {string} date
 */

/**
 * @typedef {Object} ChangeSet
 * @property {string} contents
 * @property {string} mode
 * @property {string} type
 */

/**
 * @typedef {Object} Change
 * @property {string} message
 * @property {boolean} ignoreDeletionFailures
 * @property {string[]} filesToDelete
 * @property {Record<string, string|ChangeSet>} files
 */

/** @typedef { import('@octokit/rest').Octokit } octokit */

/**
 * @param {octokit} octokit
 * @param {Options} opts
 * @returns {Promise}
 */
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

      if (!opts.batchSize) {
        opts.batchSize = 1;
      }

      if (typeof opts.batchSize !== "number") {
        return reject(`batchSize must be a number`);
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
        changes,
        batchSize,
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
            await octokit.rest.repos.get({
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
      const commits = [];
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
          for (const batch of chunk(change.filesToDelete, batchSize)) {
            await Promise.all(
              batch.map(async (fileName) => {
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
                    type: "commit",
                  });
                }
              })
            );
          }
        }

        for (const batch of chunk(Object.keys(change.files), batchSize)) {
          await Promise.all(
            batch.map(async (/** @type {string | number} */ fileName) => {
              const properties = change.files[fileName] || "";

              // Set our defaults
              let contents;
              let mode;
              let type;

              if (typeof properties == "string"){
              contents = properties;
               mode = "100644";
               type = "blob";
              }

              // If a ChangeSet object was provided, use those values instead
              else if (typeof properties == "object"){
                contents = properties.contents;
                mode = properties.mode || "100644";
                type = properties.type || "blob";
              } else {
                throw new Error("Unexpected type provided for `contents`: " + typeof contents)
              }

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
                type: type,
              });
            })
          );
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
        commits.push(commit);
      }

      // Create a ref that points to that tree
      let action = "createRef";
      let updateRefBase = "refs/";

      // Or if it already exists, we'll update that existing ref
      if (branchAlreadyExists) {
        action = "updateRef";
        updateRefBase = "";
      }

      await octokit.rest.git[action]({
        owner,
        repo,
        force: true,
        ref: `${updateRefBase}heads/${branchName}`,
        sha: baseTree,
      });

      // Return the new branch name so that we can use it later
      // e.g. to create a pull request
      return resolve({ commits });
    } catch (e) {
      return reject(e);
    }
  });
};

/**
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {any} path
 * @param {any} branch
 */
async function fileExistsInRepo(octokit, owner, repo, path, branch) {
  try {
    await octokit.rest.repos.getContent({
      method: "HEAD",
      owner,
      repo,
      path,
      ref: branch,
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {GitUser} committer
 * @param {GitUser} author
 * @param {string} message
 * @param {{ sha: any; }} tree
 * @param {any} baseTree
 */
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
    await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      committer,
      author,
      tree: tree.sha,
      parents: [baseTree],
    })
  ).data;
}

/**
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {any[]} treeItems
 * @param {any} baseTree
 */
async function createTree(octokit, owner, repo, treeItems, baseTree) {
  return (
    await octokit.rest.git.createTree({
      owner,
      repo,
      tree: treeItems,
      base_tree: baseTree,
    })
  ).data;
}

/**
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} contents
 * @param {string} type
 */
async function createBlob(octokit, owner, repo, contents, type) {
  if (type === "commit") {
    return contents;
  } else {
    let content = contents;

    if (!isBase64(content)) {
      content = Buffer.from(contents).toString("base64");
    }

    const file = (
      await octokit.rest.git.createBlob({
        owner,
        repo,
        content,
        encoding: "base64",
      })
    ).data;
    return file.sha;
  }
}

/**
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref
 */
async function loadRef(octokit, owner, repo, ref) {
  try {
    const x = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${ref}`,
    });
    return x.data.object.sha;
  } catch (e) {
    // console.log(e);
  }
}

const chunk = (input, size) => {
  return input.reduce((arr, item, idx) => {
    return idx % size === 0
      ? [...arr, [item]]
      : [...arr.slice(0, -1), [...arr.slice(-1)[0], item]];
  }, []);
};
