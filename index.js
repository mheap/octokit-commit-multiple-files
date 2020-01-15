const plugin = require("./create-or-update-files");

module.exports = function(octokit) {
  octokit.repos.createOrUpdateFiles = plugin.bind(null, octokit);
};
