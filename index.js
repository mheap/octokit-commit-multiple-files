const plugin = require("./create-or-update-files");

module.exports = function (octokit) {
  return {
    createOrUpdateFiles: plugin.bind(null, octokit),
  };
};
