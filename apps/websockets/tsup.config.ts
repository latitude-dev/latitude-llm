import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  sourcemap: false,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  loader: {
    // Tsup complains .html has no loader. But we don't have any .html files
    // So we just tell it to ignore it using 'empty' loader
    '.html': 'empty',
  },
  esbuildOptions(options) {
    options.keepNames = true
  },
  skipNodeModulesBundle: true,
  noExternal: [
    '@latitude-data/env',
    '@latitude-data/core',
    '@latitude-data/constants',
  ],
})
