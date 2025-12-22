import * as path from 'path'
import * as url from 'url'
import { readFileSync } from 'fs'

import alias from '@rollup/plugin-alias'
import replace from '@rollup/plugin-replace'
import typescript from '@rollup/plugin-typescript'
import { dts } from 'rollup-plugin-dts'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
)
const SDK_VERSION = packageJson.version

const aliasEntries = {
  entries: [
    { find: '$sdk', replacement: path.resolve(__dirname, 'src') },
    {
      find: '@latitude-data/constants',
      replacement: path.resolve(__dirname, '../../constants/src'),
    },
  ],
}
const EXTERNALS = [
  'eventsource-parser/stream',
  'node-fetch',
  'promptl-ai',
  'stream',
  'zod',
  '@opentelemetry/semantic-conventions',
  '@opentelemetry/semantic-conventions/incubating',
]
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
      replace({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        __SDK_VERSION__: SDK_VERSION,
        preventAssignment: true,
      }),
    ],
    external: EXTERNALS,
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [
      typescript({
        exclude: ['**/__tests__', '**/*.test.ts'],
      }),
      replace({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        __SDK_VERSION__: SDK_VERSION,
        preventAssignment: true,
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
