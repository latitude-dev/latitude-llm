import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  publicDir: 'node_modules/@latitude-data/core/src/public',
  outDir: 'dist',
  sourcemap: true,
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
    // skipNodeModulesBundle is true so we don't bundle dependencies yet $ is
    // not a dependency it's just a TS path alias so we force tsup to bundle it
    '$',
    '@latitude-data/env',
    '@latitude-data/core',
    '@latitude-data/constants',
  ],
})
