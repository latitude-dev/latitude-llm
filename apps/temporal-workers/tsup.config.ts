import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  loader: {
    '.html': 'empty',
  },
  skipNodeModulesBundle: true,
  noExternal: [
    '$',
    '@latitude-data/env',
    '@latitude-data/core',
    '@latitude-data/constants',
    '@latitude-data/web-ui',
    '@latitude-data/emails',
  ],
})
