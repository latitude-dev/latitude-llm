import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
  SpanExporter,
} from '@opentelemetry/sdk-trace-node'

import { AnthropicInstrumentation } from '@traceloop/instrumentation-anthropic'
import { OpenAIInstrumentation } from '@traceloop/instrumentation-openai'
import { AzureOpenAIInstrumentation } from '@traceloop/instrumentation-azure'
import { LlamaIndexInstrumentation } from '@traceloop/instrumentation-llamaindex'
import {
  AIPlatformInstrumentation,
  VertexAIInstrumentation,
} from '@traceloop/instrumentation-vertexai'
import { BedrockInstrumentation } from '@traceloop/instrumentation-bedrock'
import { CohereInstrumentation } from '@traceloop/instrumentation-cohere'
import { PineconeInstrumentation } from '@traceloop/instrumentation-pinecone'
import { LangChainInstrumentation } from '@traceloop/instrumentation-langchain'
import { ChromaDBInstrumentation } from '@traceloop/instrumentation-chromadb'
import { QdrantInstrumentation } from '@traceloop/instrumentation-qdrant'

import type * as openai from 'openai'
import type * as anthropic from '@anthropic-ai/sdk'
import type * as azure from '@azure/openai'
import type * as cohere from 'cohere-ai'
import type * as bedrock from '@aws-sdk/client-bedrock-runtime'
import type * as aiplatform from '@google-cloud/aiplatform'
import type * as vertexAI from '@google-cloud/vertexai'
import type * as pinecone from '@pinecone-database/pinecone'
import type * as ChainsModule from 'langchain/chains'
import type * as AgentsModule from 'langchain/agents'
import type * as ToolsModule from 'langchain/tools'
import type * as RunnableModule from '@langchain/core/runnables'
import type * as VectorStoreModule from '@langchain/core/vectorstores'
import type * as llamaindex from 'llamaindex'
import type * as chromadb from 'chromadb'
import type * as qdrant from '@qdrant/js-client-rest'
import { Resource } from '@opentelemetry/resources'
import { context, trace } from '@opentelemetry/api'

type IModules = {
  openAI?: typeof openai
  anthropic?: typeof anthropic
  azureOpenAI?: typeof azure
  cohere?: typeof cohere
  bedrock?: typeof bedrock
  google_vertexai?: typeof vertexAI
  google_aiplatform?: typeof aiplatform
  pinecone?: typeof pinecone
  langchain?: {
    chainsModule?: typeof ChainsModule
    agentsModule?: typeof AgentsModule
    toolsModule?: typeof ToolsModule
    runnablesModule?: typeof RunnableModule
    vectorStoreModule?: typeof VectorStoreModule
  }
  llamaIndex?: typeof llamaindex
  chromadb?: typeof chromadb
  qdrant?: typeof qdrant
}

type SpanAttributes = {
  name?: string
  metadata?: Record<string, unknown>
  prompt?: string
  distinctId?: string
}

export type LatitudeTelemetrySDKConfig = {
  exporter: SpanExporter
  modules?: IModules
  disableBatch?: boolean
}

export class LatitudeTelemetrySDK {
  private exporter: SpanExporter

  constructor({
    exporter,
    modules = {},
    disableBatch = false,
  }: LatitudeTelemetrySDKConfig) {
    this.exporter = exporter

    this._init(modules, { disableBatch })
  }

  private _init(modules: IModules, options?: { disableBatch?: boolean }) {
    const instrumentations = []
    if (!Object.keys(modules).length) {
      console.warn('Latitude: No modules to instrument')
      return
    }

    if (modules?.openAI) {
      const openAIInstrumentation = new OpenAIInstrumentation({
        enrichTokens: true,
      })
      // @ts-ignore
      openAIInstrumentation.manuallyInstrument(modules.openAI!)
      instrumentations.push(openAIInstrumentation)
    }

    if (modules?.anthropic) {
      const anthropicInstrumentation = new AnthropicInstrumentation()
      anthropicInstrumentation.manuallyInstrument(modules.anthropic!)
      instrumentations.push(new AnthropicInstrumentation())
    }

    if (modules?.azureOpenAI) {
      const azureOpenAIInstrumentation = new AzureOpenAIInstrumentation()
      azureOpenAIInstrumentation.manuallyInstrument(modules.azureOpenAI!)
      instrumentations.push(azureOpenAIInstrumentation)
    }

    if (modules?.cohere) {
      const cohereInstrumentation = new CohereInstrumentation()
      cohereInstrumentation.manuallyInstrument(modules.cohere!)
      instrumentations.push(cohereInstrumentation)
    }

    if (modules?.google_vertexai) {
      const vertexAIInstrumentation = new VertexAIInstrumentation()
      vertexAIInstrumentation.manuallyInstrument(modules.google_vertexai!)
      instrumentations.push(vertexAIInstrumentation)
    }

    if (modules?.google_aiplatform) {
      const aiplatformInstrumentation = new AIPlatformInstrumentation()
      aiplatformInstrumentation.manuallyInstrument(modules.google_aiplatform!)
      instrumentations.push(aiplatformInstrumentation)
    }

    if (modules?.bedrock) {
      const bedrockInstrumentation = new BedrockInstrumentation()
      bedrockInstrumentation.manuallyInstrument(modules.bedrock!)
      instrumentations.push(bedrockInstrumentation)
    }

    if (modules?.pinecone) {
      const pineconeInstrumentation = new PineconeInstrumentation()
      pineconeInstrumentation.manuallyInstrument(modules.pinecone!)
      instrumentations.push(pineconeInstrumentation)
    }

    if (modules?.langchain) {
      const langchainInstrumentation = new LangChainInstrumentation()
      langchainInstrumentation.manuallyInstrument(modules.langchain!)
      instrumentations.push(langchainInstrumentation)
    }

    if (modules?.llamaIndex) {
      const llamaindexInstrumentation = new LlamaIndexInstrumentation()
      llamaindexInstrumentation.manuallyInstrument(modules.llamaIndex!)
      instrumentations.push(llamaindexInstrumentation)
    }

    if (modules?.chromadb) {
      const chromadbInstrumentation = new ChromaDBInstrumentation()
      chromadbInstrumentation.manuallyInstrument(modules.chromadb!)
      instrumentations.push(chromadbInstrumentation)
    }

    if (modules?.qdrant) {
      const qdrantInstrumentation = new QdrantInstrumentation()
      qdrantInstrumentation.manuallyInstrument(modules.qdrant!)
      instrumentations.push(qdrantInstrumentation)
    }

    if (!instrumentations.length) return

    const processors = options?.disableBatch
      ? [new SimpleSpanProcessor(this.exporter)]
      : [new BatchSpanProcessor(this.exporter)]

    const sdk = new NodeSDK({
      resource: new Resource({
        'service.name': process.env.npm_package_name,
      }),
      instrumentations,
      traceExporter: this.exporter,
      // @ts-ignore
      spanProcessors: processors,
    })

    console.log('Instrumenting your code with Latitude...')

    sdk.start()
  }

  span<T>(s: SpanAttributes, fn: (span: any) => T): Promise<T> {
    const c = context.active()
    return context.with(c, () =>
      trace
        .getTracer('latitude')
        .startActiveSpan(s.name ?? 'latitude.span', {}, c, async (span) => {
          try {
            if (s.prompt) {
              span.setAttribute('latitude.prompt', s.prompt)
            }
            if (s.distinctId) {
              span.setAttribute('latitude.distinctId', s.distinctId)
            }
            if (s.metadata) {
              span.setAttribute('latitude.metadata', JSON.stringify(s.metadata))
            }
          } catch (error) {
            console.error(error)
          }

          const res = fn(span)
          if (res instanceof Promise) {
            return res.then((resolvedRes) => {
              span.end()

              return resolvedRes
            })
          }

          span.end()

          return res
        }),
    )
  }
}
