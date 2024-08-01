import { resolve } from 'path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      $ui: resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
  },
})
