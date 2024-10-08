import { readFileSync } from 'fs'

import * as glob from 'glob'
import { defineConfig } from 'tsup'

const getDependencies = (path: string) =>
  Object.keys(JSON.parse(readFileSync(path, 'utf-8')).dependencies)

const rootDependencies = getDependencies('../../package.json')
const dependencies = getDependencies('./package.json')

const scripts = glob.sync('**/scripts/**/*.ts')
export default defineConfig({
  entry: scripts,
  outDir: 'scripts-dist',
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
  noExternal: ['@latitude-data/env', '@latitude-data/core'],
  esbuildOptions: (options) => {
    options.outbase = 'scripts'
  },
})
