/// <reference types="vitest" />
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const root = dirname(filename)

export default defineConfig({
  resolve: {
    alias: {
      "$compiler": `${root}/../compiler/src`, 
      "$core": `${root}/src`,
    }
  },
  test: {
    globals: true,
    testTimeout: 5000,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['./src/**/*.test.ts'],
  },
})