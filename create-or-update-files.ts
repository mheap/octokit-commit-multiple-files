import { Octokit } from "@octokit/rest";
import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

interface FileChange {
  contents?: string | Buffer;
  mode?: "100644" | "100755" | "040000" | "160000" | "120000";
  type?: "blob" | "tree" | "commit";
}

interface Change {
  message: string;
  files?: Record<string, string | Buffer | FileChange>;
  filesToDelete?: string[];
  ignoreDeletionFailures?: boolean;
}

interface Options {
  owner: string;
  repo: string;
  branch: string;
  base?: string;
  createBranch?: boolean;
  committer?: RestEndpointMethodTypes["git"]["createCommit"]["parameters"]["committer"];
  author?: RestEndpointMethodTypes["git"]["createCommit"]["parameters"]["author"];
  changes: Change[];
  batchSize?: number;
  forkFromBaseBranch?: boolean;
}

interface CommitResult {
  commits: Array<
    RestEndpointMethodTypes["git"]["createCommit"]["response"]["data"]
  >;
}

function isBase64(str: string | Buffer): boolean {
  // Handle buffer inputs
  let strValue: string;
  if (Buffer.isBuffer(str)) {
    strValue = str.toString("utf8");
  } else {
    strValue = str;
  }

  var notBase64 = /[^A-Z0-9+\/=]/i;

  const len = strValue.length;
  if (!len || len % 4 !== 0 || notBase64.test(strValue)) {
    return false;
  }
  const firstPaddingChar = strValue.indexOf("=");
  return (
    firstPaddingChar === -1 ||
    firstPaddingChar === len - 1 ||
    (firstPaddingChar === len - 2 && strValue[len - 1] === "=")
  );
}

module.exports = function (
  octokit: Octokit,
  opts: Options,
): Promise<CommitResult> {
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
        forkFromBaseBranch,
      } = opts;

      let branchAlreadyExists = true;
      let baseTree;

      // Does the target branch already exist?
      baseTree = await loadRef(octokit, owner, repo, branchName);
      if (!baseTree || forkFromBaseBranch) {
        if (!createBranch && !baseTree) {
          return reject(
            `The branch '${branchName}' doesn't exist and createBranch is 'false'`,
          );
        }

        if (!baseTree) {
          branchAlreadyExists = false;
        }

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
      const commits: Array<
        RestEndpointMethodTypes["git"]["createCommit"]["response"]["data"]
      > = [];
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
            `either changes[].files or changes[].filesToDelete are required`,
          );
        }

        const treeItems: Array<
          RestEndpointMethodTypes["git"]["createTree"]["parameters"]["tree"][number]
        > = [];
        // Handle file deletions
        if (hasFilesToDelete) {
          for (const batch of chunk(change.filesToDelete, batchSize)) {
            await Promise.all(
              batch.map(async (fileName: string) => {
                const exists = await fileExistsInRepo(
                  octokit,
                  owner,
                  repo,
                  fileName,
                  baseTree,
                );

                // If it doesn't exist, and we're not ignoring missing files
                // reject the promise
                if (!exists && !change.ignoreDeletionFailures) {
                  return reject(
                    `The file ${fileName} could not be found in the repo`,
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
              }),
            );
          }
        }

        if (hasFiles) {
          for (const batch of chunk(Object.keys(change.files), batchSize)) {
            await Promise.all(
              batch.map(async (fileName: string) => {
                const properties = change.files[fileName] || "";

                let contents: string | Buffer;
                let mode: "100644" | "100755" | "040000" | "160000" | "120000";
                let type: "blob" | "tree" | "commit";

                if (
                  typeof properties === "string" ||
                  Buffer.isBuffer(properties)
                ) {
                  contents = properties;
                  mode = "100644";
                  type = "blob";
                } else {
                  contents = properties.contents || "";
                  mode = properties.mode || "100644";
                  type = properties.type || "blob";
                }

                if (!contents) {
                  return reject(`No file contents provided for ${fileName}`);
                }

                const fileSha = await createBlob(
                  octokit,
                  owner,
                  repo,
                  contents,
                  type,
                );

                treeItems.push({
                  path: fileName,
                  sha: fileSha,
                  mode: mode,
                  type: type,
                });
              }),
            );
          }
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
          baseTree,
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
          baseTree,
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

async function fileExistsInRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<boolean> {
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

async function createCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  committer: RestEndpointMethodTypes["git"]["createCommit"]["parameters"]["committer"],
  author: RestEndpointMethodTypes["git"]["createCommit"]["parameters"]["author"],
  message: string,
  tree: RestEndpointMethodTypes["git"]["createTree"]["response"]["data"],
  baseTree: string,
): Promise<RestEndpointMethodTypes["git"]["createCommit"]["response"]["data"]> {
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

async function createTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  treeItems: Array<
    RestEndpointMethodTypes["git"]["createTree"]["parameters"]["tree"][number]
  >,
  baseTree: string,
): Promise<RestEndpointMethodTypes["git"]["createTree"]["response"]["data"]> {
  return (
    await octokit.rest.git.createTree({
      owner,
      repo,
      tree: treeItems,
      base_tree: baseTree,
    })
  ).data;
}

async function createBlob(
  octokit: Octokit,
  owner: string,
  repo: string,
  contents: string | Buffer,
  type: string,
): Promise<string> {
  if (type === "commit") {
    // For submodules, contents is the commit SHA
    return typeof contents === "string" ? contents : contents.toString();
  } else {
    let content: string;

    if (!isBase64(contents)) {
      content = Buffer.from(contents).toString("base64");
    } else {
      content =
        typeof contents === "string" ? contents : contents.toString("base64");
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

async function loadRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<string | undefined> {
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

const chunk = <T>(input: T[], size: number): T[][] => {
  return input.reduce((arr: T[][], item: T, idx: number) => {
    return idx % size === 0
      ? [...arr, [item]]
      : [...arr.slice(0, -1), [...arr.slice(-1)[0], item]];
  }, []);
};
