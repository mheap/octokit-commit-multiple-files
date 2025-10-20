const createOrUpdateFilesPlugin = require("./create-or-update-files");

module.exports = function (octokit: any) {
  return {
    createOrUpdateFiles: createOrUpdateFilesPlugin.bind(null, octokit),
  };
};
