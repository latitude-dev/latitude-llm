import { readFileSync } from 'fs'

import { defineConfig } from 'tsup'

const getDependencies = (path: string) =>
  Object.keys(JSON.parse(readFileSync(path, 'utf-8')).dependencies)

const rootDependencies = getDependencies('../../package.json')
const dependencies = getDependencies('./package.json')

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
  external: [...rootDependencies, ...dependencies],
  noExternal: ['@latitude-data/env', '@latitude-data/jobs'],
})
