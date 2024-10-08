/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 5000,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['./src/**/*.test.ts'],
  },
})
