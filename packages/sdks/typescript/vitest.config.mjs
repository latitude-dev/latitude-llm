/// <reference types="vitest" />
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const root = dirname(filename)

export default defineConfig({
  resolve: {
    alias: {
      $core: `${root}/../core/src`,
      $sdk: `${root}/src`,
    },
  },
  test: {
    globals: true,
    testTimeout: 5000,
    environment: 'node',
    include: ['./src/**/*.test.ts'],
  },
})
