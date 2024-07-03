import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import globals from 'globals'

// FIXME: DRY me baby
// All this mambo jambo belongs to tools/eslint
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

/** @type {import("eslint").Linter.Config} */
export default [
  ...compat.extends('./node_modules/@latitude-data/eslint-config/library.js'),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
]
