import * as path from 'path'
import * as url from 'url'

import alias from '@rollup/plugin-alias'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { dts } from 'rollup-plugin-dts'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const aliasEntries = {
  entries: [{ find: '$core', replacement: path.resolve(__dirname, 'src') }],
}

const COMMON_PLUGINS = [
  typescript({
    noEmit: true,
    tsconfig: './tsconfig.json',
    exclude: ['**/__tests__', '**/*.test.ts', '**/*.d.ts'],
  }),
  commonjs(),
]
const EXTERNAL = [
  'zod',
  'drizzle-orm',
  'drizzle-orm/node-postgres',
  'drizzle-orm/pg-core',
  'next-auth',
  'pg',
  '@latitude-data/env',
]

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
]
