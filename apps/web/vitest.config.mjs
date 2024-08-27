/// <reference types="vitest" />
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const root = dirname(filename)

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 5000,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['./src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      $: `${root}/src`,
    },
  },
})
