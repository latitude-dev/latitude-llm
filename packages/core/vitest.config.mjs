/// <reference types="vitest" />
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

const filename = fileURLToPath(import.meta.url)
const root = dirname(filename)

export default defineConfig({
  plugins: [tsconfigPaths({ root })],
  test: {
    globals: true,
    testTimeout: 5000,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['./src/**/*.test.ts'],
  },
})