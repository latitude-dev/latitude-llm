import * as path from 'path'
import * as url from 'url'

import alias from '@rollup/plugin-alias'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { dts } from 'rollup-plugin-dts'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const aliasEntries = {
  entries: [{ find: '$jobs', replacement: path.resolve(__dirname, 'src') }],
}

const COMMON_PLUGINS = [
  typescript({
    noEmit: true,
    tsconfig: './tsconfig.json',
    exclude: ['**/__tests__', '**/*.test.ts', '**/*.d.ts'],
  }),
  commonjs(),
]
const EXTERNAL = ['ioredis', 'bullmq']

/** @type {import('rollup').RollupOptions[]} */
export default [
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.js' }],
    plugins: COMMON_PLUGINS,
    external: EXTERNAL,
  },
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [alias(aliasEntries), dts()],
  },
  {
    input: 'src/server.ts',
    output: [{ file: 'dist/server.js' }],
    plugins: COMMON_PLUGINS,
    external: EXTERNAL,
  },
]
