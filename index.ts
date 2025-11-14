import { Octokit } from "@octokit/rest";

import createOrUpdateFilesPlugin from "./create-or-update-files";

export default function (octokit: Octokit | any) {
  return {
    createOrUpdateFiles: createOrUpdateFilesPlugin.bind(null, octokit),
  };
}
