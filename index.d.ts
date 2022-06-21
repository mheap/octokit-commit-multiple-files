declare module "octokit-commit-multiple-files" {
  import { Octokit } from "@octokit/rest";

  declare function plugin(octokit: Octokit);
}

declare module "octokit-commit-multiple-files/create-or-update-files" {
  import { Octokit } from "@octokit/rest";

  type BufferFromSource =
    | arrayBuffer
    | Uint8Array
    | ReadonlyArray<number>
    | WithImplicitCoercion<Uint8Array | ReadonlyArray<number> | string>
    | WithImplicitCoercion<string>
    | { [Symbol.toPrimitive](hint: "string"): string };

  interface CreateOrUpdateFilesOptions {
    owner: string;
    repo: string;
    branch: string;
    changes: Array<{
      message: string;
      files: {
        [path: string]: string | BufferFromSource | { contents: string | BufferFromSource };
      };
    }>;
  }

  export default function createOrUpdateFiles(octokit: Octokit, opts: CreateOrUpdateFilesOptions);
}
