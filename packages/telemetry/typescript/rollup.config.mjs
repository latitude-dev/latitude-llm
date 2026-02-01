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
    {
      find: '@latitude-data/constants',
      replacement: path.resolve(__dirname, '../../constants/src'),
    },
    {
      find: '@latitude-data/sdk',
      replacement: path.resolve(__dirname, '../../sdks/typescript/src'),
    },
  ],
}

const EXTERNALS = [
  '@opentelemetry/api',
  '@opentelemetry/core',
  '@opentelemetry/resources',
  '@opentelemetry/instrumentation',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/context-async-hooks',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/baggage-span-processor',
  '@opentelemetry/semantic-conventions',
  '@opentelemetry/semantic-conventions/incubating',
  '@traceloop/instrumentation-anthropic',
  '@traceloop/instrumentation-azure',
  '@traceloop/instrumentation-bedrock',
  '@traceloop/instrumentation-cohere',
  '@traceloop/instrumentation-langchain',
  '@traceloop/instrumentation-llamaindex',
  '@traceloop/instrumentation-openai',
  '@traceloop/instrumentation-together',
  '@traceloop/instrumentation-vertexai',
  '@latitude-data/sdk',
  '@anthropic-ai/sdk',
  '@aws-sdk/client-bedrock-runtime',
  '@azure/openai',
  '@google-cloud/aiplatform',
  '@google-cloud/vertexai',
  '@langchain/core',
  'ai',
  'cohere-ai',
  'langchain',
  'llamaindex',
  'openai',
  '@openai/agents',
  'together-ai',
  'promptl-ai',
  'zod',
  'uuid',
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
