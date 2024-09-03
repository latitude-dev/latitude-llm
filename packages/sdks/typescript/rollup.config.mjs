import * as path from 'path'
import * as url from 'url'

import alias from '@rollup/plugin-alias'
import typescript from '@rollup/plugin-typescript'
import { dts } from 'rollup-plugin-dts'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const aliasEntries = {
  entries: [
    { find: '$sdk', replacement: path.resolve(__dirname, 'src') },
    {
      find: '@latitude-data/core/browser',
      replacement: path.resolve(__dirname, '../../core/src/browser'),
    },
  ],
}
const EXTERNALS = ['@t3-oss/env-core', 'zod']
const config = [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      typescript({
        exclude: ['**/__tests__', '**/*.test.ts'],
      }),
    ],
    external: EXTERNALS,
  },
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [alias(aliasEntries), dts()],
    external: EXTERNALS,
  },
]

export default config
