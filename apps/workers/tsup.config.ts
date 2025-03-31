import { readFileSync } from 'fs'

import { defineConfig } from 'tsup'

const getDependencies = (path: string) => {
  const deps = JSON.parse(readFileSync(path, 'utf-8')).dependencies
  if (!deps) return []

  return Object.keys(deps)
}

const rootDependencies = getDependencies('../../package.json')
const dependencies = getDependencies('./package.json')

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
    // Tsup complains .html has no loader. But we don't have any .html files
    // So we just tell it to ignore it using 'empty' loader
    '.html': 'empty',
  },
  external: [...rootDependencies, ...dependencies, 'consolidate'],
  noExternal: [
    '@latitude-data/env',
    '@latitude-data/core',
    '@latitude-data/constants',
  ],
})
