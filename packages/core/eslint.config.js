const baseConfig = require('@latitude-data/eslint-config')
const { fixupPluginRules } = require('@eslint/compat')
const drizzlePlugin = require('eslint-plugin-drizzle')

module.exports = [
  ...baseConfig,
  {
    plugins: {
      drizzle: fixupPluginRules(drizzlePlugin),
    },
    rules: {
      'no-constant-condition': 'off',
      'drizzle/enforce-delete-with-where': 'error',
      'drizzle/enforce-update-with-where': 'error',
    },
  },
]