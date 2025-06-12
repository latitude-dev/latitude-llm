const { resolve } = require('node:path')
const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const prettierConfig = require('eslint-config-prettier')
const reactHooksPlugin = require('eslint-plugin-react-hooks')

const project = resolve(process.cwd(), 'tsconfig.json')

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: process.cwd(),
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
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
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Turbo-specific rules
      'turbo/no-undeclared-env-vars': 'off',
    },
  },
  {
    ignores: [
      '.*.js',
      '.*.cjs',
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      '.next/**',
      'build/**',
      'out/**',
      'coverage/**',
    ],
  },
]
