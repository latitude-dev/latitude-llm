import baseConfig from '@latitude-data/eslint-config'
import nextPlugin from '@next/eslint-plugin-next'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'no-constant-condition': 'off',
      '@next/next/no-duplicate-head': 'off',
      '@next/next/no-page-custom-font': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/prefer-as-const': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
    },
  },
]