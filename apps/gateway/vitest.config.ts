import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const root = dirname(filename)

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      $: `${root}/src`,
      $core: `${root}/../../packages/core/src`,
      $compiler: `${root}/../../packages/compiler/src`,
    },
  },
})
