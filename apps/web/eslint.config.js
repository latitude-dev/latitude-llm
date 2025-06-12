const baseConfig = require('@latitude-data/eslint-config')
const nextPlugin = require('@next/eslint-plugin-next')

module.exports = [
  ...baseConfig,
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      'no-constant-condition': 'off',
    },
    languageOptions: {
      globals: {
        React: 'readonly',
      },
    },
  },
]