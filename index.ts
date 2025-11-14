import { Octokit } from "@octokit/rest";

const createOrUpdateFilesPlugin = require("./create-or-update-files");

module.exports = function (octokit: Octokit) {
  return {
    createOrUpdateFiles: createOrUpdateFilesPlugin.bind(null, octokit),
  };
};
