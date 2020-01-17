# octokit-commit-multiple-files

This plugin is an alternative to using `octokit.repos.createOrUpdateFile` which allows you to edit the contents of a single file.

## Installation

```bash
npm install octokit-commit-multiple-files --save
```

## Usage

This plugin accepts `owner`, `repo`, `path`, `branch` and `message` like `.createOrUpdateFile` ([Octokit Docs](https://octokit.github.io/rest.js/#octokit-routes-repos-create-or-update-file)).

If the `branch` provided does not exist, the plugin will error. To automatically create it, set `createBranch` to true. You may provide a `base` branch if you choose to do this, or the plugin will use the repo's default branch as the base.

In addition, it accepts `changes` which is an array of objects containing a `path` and the file `contents`.

```javascript
const Octokit = require("@octokit/rest").plugin(
  require("octokit-commit-multiple-files")
);
const octokit = new Octokit();

const branchName = await octokit.repos.createOrUpdateFiles({
  owner,
  repo,
  branch,
  createBranch,
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

