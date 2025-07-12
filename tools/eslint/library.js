const { resolve } = require('node:path')	

const project = resolve(process.cwd(), 'tsconfig.json')	
const turboConfig = require('eslint-config-turbo')	
const unwrappedTurbo = turboConfig.default || turboConfig	

/** @type {import("eslint").Linter.Config} */	
module.exports = {	
  extends: [	
    'eslint:recommended',	
    'prettier',	
    'plugin:react-hooks/recommended-legacy',	
    ...(unwrappedTurbo.extends || []),	
  ],	
  plugins: ['@typescript-eslint/eslint-plugin'],	
  parser: '@typescript-eslint/parser',	
  settings: {	
    'import/resolver': {	
      typescript: {	
        project,	
      },	
    },	
  },	
  parserOptions: {	
    // Ignores these warnings when running ESLint	
    // Example:	
    // WARNING: You are currently running a version of TypeScript which is not officially	
    // supported by @typescript-eslint/typescript-estree.	
    warnOnUnsupportedTypeScriptVersion: false,	
  },	
  ignorePatterns: [	
    // Ignore dotfiles	
    '.*.js',	
    'node_modules/',	
    'dist/',	
  ],	
  overrides: [	
    {	
      files: ['*.js?(x)', '*.ts?(x)'],	
    },	
  ],	
  rules: {	
    'no-unused-vars': 'off',	
    'no-case-declarations': 'warn',	
    'react-hooks/exhaustive-deps': 'error',	
    '@typescript-eslint/no-unused-vars': [	
      'error',	
      {	
        args: 'all',	
        argsIgnorePattern: '^_',	
        varsIgnorePattern: '^_',	
      },	
    ],	
  },	
}	

