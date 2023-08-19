# octokit-commit-multiple-files

This plugin is an alternative to using `octokit.rest.repos.createOrUpdateFile` which allows you to edit the contents of a single file.

## Installation

```bash
npm install octokit-commit-multiple-files --save
```

## Usage

This plugin accepts `owner`, `repo`, `path` and `branch` like `.createOrUpdateFile` ([Octokit Docs](https://octokit.github.io/rest.js/v18#repos-create-or-update-file)).

If the `branch` provided does not exist, the plugin will error. To automatically create it, set `createBranch` to true. You may provide a `base` branch if you choose to do this, or the plugin will use the repo's default branch as the base.

In addition, it accepts `changes` which is an array of objects containing a `message` and a `files` object

```javascript
let { Octokit } = require("@octokit/rest");
Octokit = Octokit.plugin(require("octokit-commit-multiple-files"));

const octokit = new Octokit();

const commits = await octokit.createOrUpdateFiles({
  owner,
  repo,
  branch,
  createBranch,
  changes: [
    {
      message: "Your commit message",
      files: {
        "test.md": `# This is a test

I hope it works`,
        "test2.md": {
          contents: `Something else`,
        },
      },
    },
    {
      message: "This is a separate commit",
      files: {
        "second.md": "Where should we go today?",
      },
    },
  ],
});
```

If you want to upload non-text data, you can `base64`` encode the content and provide that as the value. Here's an example that would upload a small GitHub icon to a repository:

```javascript
const commits = await octokit.createOrUpdateFiles({
  owner,
  repo,
  branch,
  createBranch,
  changes: [
    {
      message: "Add Icon",
      files: {
            "icon.png": `iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADFUlEQVR42u2WXyjzYRTHvz/N3zZ/5sJyoWEUEleKrYbcaEXKXCBWVsrFkii3LrVwo6Sslj/hhqS4cecOtcWFtUbI34RlNn83786p1fu+F+9+a/Ou982pp56e3+l3Ps855/k+j6BWqwMABMTBPoMmBAE+4xE8ZN8A3wCiAYqKinB8fAy/3/9Hv6ysLCQnJ+P6+jp2AEqlEvPz87i/v8fc3By2t7dRUFCAzMxM/k7rNDo7O1FbWwu73Q6TyRQ7gOrqapjNZtFpvby8RFtbW+wAVCoVrFaraICTkxPORswAhoaG0NzcLBqAbGxsDKurq9EDyGQyrK+vQyKRRARwdnaG9vb26AHKy8sxNTXF8/39fSwsLODx8RGpqalIS0sjPYfP58Pz8zOys7NhMBj4xNB6XV0dPj4+ogMoKyvD9PQ0bm5u0NHRgZaWFg5ssVh+8aOaJyUlYWVlBUtLS5BKpXwiogaQy+VYW1vDxsYGxsfHUV9fj6urK9ze3uLi4oJ9UlJSoNVqcXd3x6kfHBzkzDU2NkZeAhKShIQETiH9mHY7MjKC8/NzDA8Pw9DdDc/TEzY3Nznt5CcIArq6urgU1C8TExO8To1IPjTIh9ZIL8ICkDMNr9eLl5cX3g39rK+vj1NKYA6HgwXq7e2Nz31+fj6X4PX1lcvT39+Pg4MDVkUqBwWn8fDwEFkJEhMT8f7+jtLSUhiNRjidTuzu7rLUymTSIJAfHo+HS1VRUYGamhrMzs5ib28vbPpFAVDNqRFnZmY4lQqFAg0NDejt7eUskdHOSKi2trZwenoqKrBoALKenh4EAgEsLi7yZTQ6OoqqqiqeU3DSiJ2dHQwMDEQUXDRAeno6JicnuSGpLwoLC2Gz2ZCTk8NZcbvdyM3NhV6v/xqAEASda2oq6niqcUlJCQMcHR2hsrISra2tXwfwsy0vL+Pw8BDFxcXc9X8VgBqPhIlqTgB0QlwuFzQaDZqamsI+WKIG0Ol0fOYzMjJY+UgH8vLyWKpJDwjuSwFCRi8ieqL9Po/U/p1H6TfA/wsQvL0CQuhWiYP9AJQGkyweNFh0AAAAAElFTkSuQmCC`
      }
    },
  ],
});
```

In addition, you can set the `mode` of a file change. For example, if you wanted to update a submodule pointer:

```javascript
{
  "message": "This is a submodule commit",
  "files": {
    "my_submodule": {
      "contents": "your-commit-sha",
      "mode": "160000",
      "type": "commit"
    }
  }
}
```

In addition, you can set the `filesToDelete` property as an array of strings (file paths) to set files for deletion in a single commit (works with updates and creations).

```javascript
{
  "message": "This commit removes files",
  "filesToDelete": ['path/to/my/file.txt', 'path/to/another.js'],
}
```

- Note that the `ignoreDeletionFailures` property is set to false by default (works in a context of a single change).
- If `ignoreDeletionFailures` is set to false, an error will be thrown if any file set for deletion is missing and the commits will stop processing. Any commits made before this will still be applied. Any changes in this `change` will not be committed. No future changes will be applied.
- If `ignoreDeletionFailures` is set to true, missing files that are set for deletion will be ignored.
- If a file is created and deleted in the same `change`, the file will be created/updated

```javascript
{
  "message": "This commit removes files",
  "filesToDelete": ['path/to/my/file.txt', 'path/to/another.js'],
  "ignoreDeletionFailures": true,
}
```

- If `batchSize` is set, then file deletions and file uploads will use batched concurrent requests as opposed to iterating through them. This can be helpful for uploading many small files. Beware of your Github usage limits. 

```javascript
{
  "batchSize": 10
}
