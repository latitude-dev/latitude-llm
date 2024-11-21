import * as path from 'path'
import * as url from 'url'

import alias from '@rollup/plugin-alias'
import replace from '@rollup/plugin-replace'
import typescript from '@rollup/plugin-typescript'
import { dts } from 'rollup-plugin-dts'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const aliasEntries = {
  entries: [
    { find: '$telemetry', replacement: path.resolve(__dirname, 'src') },
  ],
}

const EXTERNALS = [
  '@opentelemetry/api',
  '@opentelemetry/core',
  '@opentelemetry/otlp-exporter-base',
  '@opentelemetry/otlp-transformer',
  '@opentelemetry/resources',
  '@opentelemetry/sdk-trace-base',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/semantic-conventions',
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
