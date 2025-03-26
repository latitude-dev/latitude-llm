import { readFileSync } from 'fs'
import { defineConfig } from 'tsup'

const getDependencies = (path: string) =>
  Object.keys(JSON.parse(readFileSync(path, 'utf-8')).dependencies)

const rootDependencies = getDependencies('../../package.json')
const dependencies = getDependencies('./package.json')

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/browser.ts',
    'src/cache/index.ts',
    'src/client/index.ts',
    'src/data-access/index.ts',
    'src/data-migrations/index.ts',
    'src/events/index.ts',
    'src/tests/factories/index.ts',
    'src/jobs/index.ts',
    'src/lib/index.ts',
    'src/mailers/index.ts',
    'src/queues/index.ts',
    'src/redis/index.ts',
    'src/repositories/index.ts',
    'src/schema/index.ts',
    'src/services/index.ts',
    'src/tests/useTestDatabase.ts',
    'src/websockets/index.ts',
  ],
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
