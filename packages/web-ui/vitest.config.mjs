import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

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
