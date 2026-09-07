const js = require("@eslint/js")
const tsParser = require("@typescript-eslint/parser")
const tsPlugin = require("@typescript-eslint/eslint-plugin")
const prettier = require("eslint-config-prettier")
const globals = require("globals")

module.exports = [
    {
        ignores: [".github", "database", "metadata", "dist", "docs", "node_modules"],
    },

    js.configs.recommended,

    {
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.node,
            },
        },
    },

    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tsParser,
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            "no-unused-vars": "off",
            "no-undef": "off",
            "@typescript-eslint/no-unused-vars": "error",
            "no-dupe-class-members": "off",
        },
    },

    prettier,
]
