import { readFileSync } from 'fs'
import { defineConfig } from 'tsup'

const getDependencies = (path: string) =>
  Object.keys(JSON.parse(readFileSync(path, 'utf-8')).dependencies)

const rootDependencies = getDependencies('../../package.json')
const dependencies = getDependencies('./package.json')

const common = ['src/index.ts', 'src/browser.ts']
const entries =
  process.env.NODE_ENV === 'test'
    ? common
    : [...common, 'src/tests/factories/index.ts', 'src/tests/index.ts']

export default defineConfig({
  entry: entries,
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
  external: [...rootDependencies, ...dependencies],
  noExternal: ['@latitude-data/env', '@latitude-data/constants'],
  splitting: false,
  minify: false,
  treeshake: true,
})
