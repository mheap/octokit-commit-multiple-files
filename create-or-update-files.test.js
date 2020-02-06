const plugin = require("./create-or-update-files");
const Octokit = require("@octokit/rest");

const nock = require("nock");
nock.disableNetConnect();
const octokit = new Octokit();

function run(body) {
  return plugin(octokit, body);
}

const validRequest = {
  owner: "mheap",
  repo: "test-repo",
  branch: "new-branch-name",
  createBranch: true,
  base: "base-branch-name",
  changes: [
    {
      message: "Your commit message",
      files: {
        "test.md": `# This is a test

I hope it works`,
        "test2.md": {
          contents: `Something else`
        }
      }
    }
  ]
};

// Destructuring for easier access later
let { owner, repo, base, branch, createBranch, changes } = validRequest;

for (let req of ["owner", "repo", "branch"]) {
  const body = { ...validRequest };
  delete body[req];
  test(`missing parameter (${req})`, () => {
    expect(run(body)).rejects.toEqual(`'${req}' is a required parameter`);
  });
}

test(`missing parameter (changes)`, () => {
  const body = { ...validRequest };
  delete body["changes"];
  expect(run(body)).rejects.toEqual(`No changes provided`);
});

test(`empty parameter (changes)`, () => {
  const body = { ...validRequest, changes: [] };
  expect(run(body)).rejects.toEqual(`No changes provided`);
});

test(`branch does not exist, createBranch false`, async () => {
  mockGetRef(branch, `sha-${branch}`, false);
  const body = { ...validRequest, createBranch: false };

  await expect(run(body)).rejects.toEqual(
    `The branch 'new-branch-name' doesn't exist and createBranch is 'false'`
  );
});

test(`branch does not exist, provided base does not exist`, async () => {
  mockGetRef(branch, `sha-${branch}`, false);
  mockGetRef(base, `sha-${base}`, false);
  const body = { ...validRequest };

  await expect(run(body)).rejects.toEqual(
    `The branch 'base-branch-name' doesn't exist`
  );
});

test(`no commit message`, async () => {
  const repoDefaultBranch = "master";
  mockGetRef(branch, `sha-${branch}`, true);
  mockGetRef(base, `sha-${base}`, true);
  mockGetRef(repoDefaultBranch, `sha-${repoDefaultBranch}`, true);

  const body = {
    ...validRequest,
    changes: [
      {
        files: {
          "test.md": null
        }
      }
    ]
  };
  await expect(run(body)).rejects.toEqual(
    `changes[].message is a required parameter`
  );
});

test(`no files provided (empty object)`, async () => {
  const repoDefaultBranch = "master";
  mockGetRef(branch, `sha-${branch}`, true);
  mockGetRef(base, `sha-${base}`, true);
  mockGetRef(repoDefaultBranch, `sha-${repoDefaultBranch}`, true);

  const body = {
    ...validRequest,
    changes: [{ message: "Test Commit", files: {} }]
  };
  await expect(run(body)).rejects.toEqual(
    `changes[].files is a required parameter`
  );
});

test(`no files provided (missing object)`, async () => {
  const repoDefaultBranch = "master";
  mockGetRef(branch, `sha-${branch}`, true);
  mockGetRef(base, `sha-${base}`, true);
  mockGetRef(repoDefaultBranch, `sha-${repoDefaultBranch}`, true);

  const body = { ...validRequest, changes: [{ message: "Test Commit" }] };
  await expect(run(body)).rejects.toEqual(
    `changes[].files is a required parameter`
  );
});

test(`no file contents provided`, async () => {
  const repoDefaultBranch = "master";
  mockGetRef(branch, `sha-${branch}`, true);
  mockGetRef(base, `sha-${base}`, true);
  mockGetRef(repoDefaultBranch, `sha-${repoDefaultBranch}`, true);

  const body = {
    ...validRequest,
    changes: [
      {
        message: "This is a test",
        files: {
          "test.md": null
        }
      }
    ]
  };
  await expect(run(body)).rejects.toEqual(
    `No file contents provided for test.md`
  );
});

test(`success (branch exists)`, async () => {
  const body = {
    ...validRequest
  };
  mockGetRef(branch, `sha-${branch}`, true);
  mockCreateBlobFileOne();
  mockCreateBlobFileTwo();
  mockCreateTree(`sha-${branch}`);
  mockCommit(`sha-${branch}`);
  mockUpdateRef(branch);

  await expect(run(body)).resolves.toEqual(branch);
});

test(`success (createBranch, base provided)`, async () => {
  const body = {
    ...validRequest,
    createBranch: true
  };
  mockGetRef(branch, `sha-${branch}`, false);
  mockGetRef(base, `sha-${base}`, true);
  mockCreateBlobFileOne();
  mockCreateBlobFileTwo();
  mockCreateTree(`sha-${base}`);
  mockCommit(`sha-${base}`);
  mockCreateRef(branch);

  await expect(run(body)).resolves.toEqual(branch);
});

test(`success (createBranch, use default base branch)`, async () => {
  const body = {
    ...validRequest,
    createBranch: true
  };
  delete body.base;

  const repoDefaultBranch = "master";

  mockGetRef(branch, `sha-${branch}`, false);
  mockGetRepo(repoDefaultBranch);
  mockGetRef(repoDefaultBranch, `sha-${repoDefaultBranch}`, true);
  mockCreateBlobFileOne();
  mockCreateBlobFileTwo();
  mockCreateTree(`sha-${repoDefaultBranch}`);
  mockCommit(`sha-${repoDefaultBranch}`);
  mockCreateRef(branch);

  await expect(run(body)).resolves.toEqual(branch);
});

function mockGetRef(branch, sha, success) {
  const m = nock("https://api.github.com").get(
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`
  );

  const body = {
    object: {
      sha: sha
    }
  };

  if (success) {
    m.reply(200, body);
  } else {
    m.reply(404);
  }
}

function mockCreateBlob(content, sha) {
  const expectedBody = { content: content, encoding: "base64" };
  const m = nock("https://api.github.com").post(
    `/repos/${owner}/${repo}/git/blobs`,
    expectedBody
  );

  const body = {
    sha: sha,
    url: `https://api.github.com/repos/mheap/action-test/git/blobs/${sha}`
  };

  m.reply(200, body);
}

function mockCreateBlobFileOne() {
  return mockCreateBlob(
    "IyBUaGlzIGlzIGEgdGVzdAoKSSBob3BlIGl0IHdvcmtz",
    "afb296bb7f3e327767bdda481c4877ba4a09e02e"
  );
}

function mockCreateBlobFileTwo() {
  return mockCreateBlob(
    "U29tZXRoaW5nIGVsc2U=",
    "a71ee6d9405fed4f6fd181c61ceb40ef10905d30"
  );
}

function mockCreateTree(baseTree) {
  const expectedBody = {
    tree: [
      {
        path: "test.md",
        sha: "afb296bb7f3e327767bdda481c4877ba4a09e02e",
        mode: "100644",
        type: "blob"
      },
      {
        path: "test2.md",
        sha: "a71ee6d9405fed4f6fd181c61ceb40ef10905d30",
        mode: "100644",
        type: "blob"
      }
    ],
    base_tree: baseTree
  };

  const m = nock("https://api.github.com").post(
    `/repos/${owner}/${repo}/git/trees`,
    expectedBody
  );

  const body = {
    sha: "4112258c05f8ce2b0570f1bbb1a330c0f9595ff9"
  };

  m.reply(200, body);
}

function mockCommit(baseTree) {
  const expectedBody = {
    message: "Your commit message",
    tree: "4112258c05f8ce2b0570f1bbb1a330c0f9595ff9",
    parents: [baseTree]
  };

  const m = nock("https://api.github.com").post(
    `/repos/${owner}/${repo}/git/commits`,
    expectedBody
  );

  const body = {
    sha: "ef105a72c03ce2743d90944c2977b1b5563b43c0"
  };

  m.reply(200, body);
}

function mockUpdateRef(branch) {
  const expectedBody = {
    force: true,
    sha: "ef105a72c03ce2743d90944c2977b1b5563b43c0"
  };

  const m = nock("https://api.github.com").patch(
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    expectedBody
  );

  m.reply(200);
}

function mockCreateRef(branch) {
  const expectedBody = {
    force: true,
    ref: `refs/heads/${branch}`,
    sha: "ef105a72c03ce2743d90944c2977b1b5563b43c0"
  };

  const m = nock("https://api.github.com").post(
    `/repos/${owner}/${repo}/git/refs`,
    expectedBody
  );

  m.reply(200);
}

function mockGetRepo(defaultBranch) {
  const body = {
    default_branch: "master"
  };

  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}`)
    .reply(200, body);
}
