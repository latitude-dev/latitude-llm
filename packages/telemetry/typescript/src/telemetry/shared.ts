import {
  BaseSegmentBaggage,
  BaseSpanMetadata,
  DocumentSegmentBaggage,
  HttpSpanMetadata,
  ToolSpanMetadata,
} from '@latitude-data/constants'
import * as tracing from '@opentelemetry/api'
import { SpanExporter } from '@opentelemetry/sdk-trace-node'

import type * as anthropic from '@anthropic-ai/sdk'
import type * as bedrock from '@aws-sdk/client-bedrock-runtime'
import type * as azure from '@azure/openai'
import type * as aiplatform from '@google-cloud/aiplatform'
import type * as vertexai from '@google-cloud/vertexai'
import type * as langchain_runnables from '@langchain/core/runnables'
import type * as langchain_vectorstores from '@langchain/core/vectorstores'
import type * as latitude from '@latitude-data/sdk'
import type * as cohere from 'cohere-ai'
import type * as langchain_agents from 'langchain/agents'
import type * as langchain_chains from 'langchain/chains'
import type * as langchain_tools from 'langchain/tools'
import type * as llamaindex from 'llamaindex'
import type * as openai from 'openai'
import type * as togetherai from 'together-ai'

export const LATITUDE_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://gateway.latitude.so'
    : 'http://localhost:8787'
export const LATITUDE_TRACES_URL = `${LATITUDE_BASE_URL}/api/v3/otlp/v1/traces`

export const TELEMETRY_SERVICE_NAME = process.env.npm_package_name
export const TELEMETRY_INSTRUMENTATION_NAME =
  'opentelemetry.instrumentation.latitude'

export enum Instrumentation {
  Latitude = 'latitude',
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  AzureOpenAI = 'azure',
  VercelAI = 'vercelai',
  VertexAI = 'vertexai',
  AIPlatform = 'aiplatform',
  Bedrock = 'bedrock',
  TogetherAI = 'togetherai',
  Cohere = 'cohere',
  Langchain = 'langchain',
  LlamaIndex = 'llamaindex',
}

export type TelemetryOptions = {
  instrumentations?: {
    [Instrumentation.Latitude]?: typeof latitude.Latitude
    [Instrumentation.OpenAI]?: typeof openai.OpenAI
    [Instrumentation.Anthropic]?: typeof anthropic
    [Instrumentation.AzureOpenAI]?: typeof azure
    [Instrumentation.VercelAI]?: 'auto'
    [Instrumentation.VertexAI]?: typeof vertexai
    [Instrumentation.AIPlatform]?: typeof aiplatform
    [Instrumentation.Bedrock]?: typeof bedrock
    [Instrumentation.TogetherAI]?: typeof togetherai.Together
    [Instrumentation.Cohere]?: typeof cohere
    [Instrumentation.Langchain]?: {
      chainsModule: typeof langchain_chains
      agentsModule: typeof langchain_agents
      toolsModule: typeof langchain_tools
      vectorStoreModule: typeof langchain_vectorstores
      runnablesModule: typeof langchain_runnables
    }
    [Instrumentation.LlamaIndex]?: typeof llamaindex
  }
  disableBatch?: boolean
  exporter?: SpanExporter
}

export type SpanOptions = {
  name?: string
  externalId?: string
  attributes?: tracing.Attributes
}

export type ToolSpanOptions = SpanOptions &
  Omit<ToolSpanMetadata, keyof BaseSpanMetadata>

export type HttpSpanOptions = SpanOptions &
  Omit<HttpSpanMetadata, keyof BaseSpanMetadata>

export type SegmentOptions = SpanOptions & {
  baggage?: Record<string, unknown>
}

export type DocumentSegmentOptions = SegmentOptions &
  Omit<DocumentSegmentBaggage, keyof BaseSegmentBaggage>
