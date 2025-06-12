const { resolve } = require('node:path')
const { fixupPluginRules } = require('@eslint/compat')
const typescriptPlugin = require('@typescript-eslint/eslint-plugin')
const typescriptParser = require('@typescript-eslint/parser')
const reactHooksPlugin = require('eslint-plugin-react-hooks')
const turboPlugin = require('eslint-config-turbo')

const project = resolve(process.cwd(), 'tsconfig.json')

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [
      '**/.*.js',
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project,
        ecmaVersion: 'latest',
        sourceType: 'module',
        // Ignores these warnings when running ESLint
        // Example:
        // WARNING: You are currently running a version of TypeScript which is not officially
        // supported by @typescript-eslint/typescript-estree.
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      'react-hooks': fixupPluginRules(reactHooksPlugin),
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-case-declarations': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          project,
        },
      },
    },
  },
]

module.exports = config
module.exports.default = config
