import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  publicDir: 'node_modules/@latitude-data/core/src/public',
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  esbuildOptions(options) {
    options.keepNames = true
  },
  loader: {
    // Tsup complains .html has no loader. But we don't have any .html files
    // So we just tell it to ignore it using 'empty' loader
    '.html': 'empty',
  },
  skipNodeModulesBundle: true,
  noExternal: [
    '$',
    '@latitude-data/env',
    '@latitude-data/core',
    '@latitude-data/constants',
    // Why is this here:
    // Core use `emails` -> emails use `web-ui`
    '@latitude-data/web-ui',
    '@latitude-data/emails',
  ],
})
