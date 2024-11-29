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
  '@anthropic-ai/sdk',
  '@aws-sdk/client-bedrock-runtime',
  '@azure/openai',
  '@google-cloud/aiplatform',
  '@google-cloud/vertexai',
  '@langchain/core',
  '@opentelemetry/api',
  '@opentelemetry/core',
  '@opentelemetry/otlp-exporter-base',
  '@opentelemetry/otlp-transformer',
  '@opentelemetry/resources',
  '@opentelemetry/sdk-node',
  '@opentelemetry/sdk-trace-base',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/semantic-conventions',
  '@pinecone-database/pinecone',
  '@qdrant/js-client-rest',
  '@traceloop/instrumentation-anthropic',
  '@traceloop/instrumentation-azure',
  '@traceloop/instrumentation-bedrock',
  '@traceloop/instrumentation-chromadb',
  '@traceloop/instrumentation-cohere',
  '@traceloop/instrumentation-langchain',
  '@traceloop/instrumentation-llamaindex',
  '@traceloop/instrumentation-openai',
  '@traceloop/instrumentation-pinecone',
  '@traceloop/instrumentation-qdrant',
  '@traceloop/instrumentation-vertexai',
  'ai',
  'chromadb',
  'cohere-ai',
  'langchain',
  'llamaindex',
  'openai',
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
