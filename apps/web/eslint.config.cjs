const baseConfig = require('@latitude-data/eslint-config')
const nextPlugin = require('@next/eslint-plugin-next')

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...baseConfig,
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'no-constant-condition': 'off',
    },
  },
]