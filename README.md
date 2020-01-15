# octokit-commit-multiple-files

This plugin is an alternative to using `octokit.repos.createOrUpdateFile` which allows you to edit the contents of a single file.

## Installation

```bash
npm install octokit-commit-multiple-files --save
```

## Usage

This plugin accepts `owner`, `repo`, `path`, `branch` and `message` like `createOrUpdateFile`.

In addition, it accepts `changes` which is an array of objects containing a `path` and the file `contents`.

It also accepts a `newBranch` parameter which will commit these changes to a different branch than the one provided. You can set `overwriteBranch` to `true` to use `branch` as the base commit, or `false` to use the latest commit on `newBranch` as the base commit.

```javascript
const Octokit = require("@octokit/rest").plugin(require("."));
const octokit = new Octokit();

const branchName = await octokit.repos.createOrUpdateFiles({
  owner,
  repo,
  path,
  branch,
  message,
  changes: [
    {
      path: "test.md",
      contents: "One"
    },
    {
      path: "test2.md",
      contents: "Two"
    }
  ]
})
```

