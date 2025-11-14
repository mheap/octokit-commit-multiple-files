import { defineConfig } from "eslint/config";
import prettier from "eslint-plugin-prettier";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default defineConfig([{
    plugins: {
        prettier,
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2020,
        sourceType: "module",

        parserOptions: {
            impliedStrict: true,

            ecmaFeatures: {
                impliedStrict: true,
                experimentalObjectRestSpread: true,
            },
        },
    },

    files: ["**/*.ts"],
    rules: {
        "prettier/prettier": "error",
    },
}]);
