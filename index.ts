import { Octokit } from "@octokit/rest";

import { createOrUpdateFiles, Options } from "./create-or-update-files";

const CreateOrUpdateFiles = function (octokit: Octokit | any) {
  return {
    createOrUpdateFiles: (opts: Options) => createOrUpdateFiles(octokit, opts),
  };
};

export { CreateOrUpdateFiles };
