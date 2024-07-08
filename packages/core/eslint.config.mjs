import drizzle from "eslint-plugin-drizzle";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [
    ...compat.extends("./node_modules/@latitude-data/eslint-config/library.js"),
    {
        plugins: {
            drizzle,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },
        },

        rules: {
            "drizzle/enforce-delete-with-where": "error",
            "drizzle/enforce-update-with-where": "error",
        },
    },
];