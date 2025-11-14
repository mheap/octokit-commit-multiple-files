import { Octokit } from "@octokit/rest";

import { createOrUpdateFiles } from "./create-or-update-files";

const CreateOrUpdateFiles = function (octokit: Octokit | any) {
  return {
    createOrUpdateFiles: (opts: any) => createOrUpdateFiles(octokit, opts),
  };
};

export { CreateOrUpdateFiles };
