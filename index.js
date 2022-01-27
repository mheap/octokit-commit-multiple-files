const plugin = require("./create-or-update-files");

module.exports = function(octokit) {
  octokit.rest.repos.createOrUpdateFiles = plugin.bind(null, octokit);
};
