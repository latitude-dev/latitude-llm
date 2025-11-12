import { FinishReason } from 'ai'
import { Message } from 'promptl-ai'
import { LogSources } from '../models'

export enum SpanKind {
  Internal = 'internal',
  Server = 'server',
  Client = 'client',
  Producer = 'producer',
  Consumer = 'consumer',
}

// Note: loosely based on OpenTelemetry GenAI semantic conventions
export enum SpanType {
  Tool = 'tool', // Note: asynchronous tools such as agents are conversation segments
  Completion = 'completion',
  Embedding = 'embedding',
  Retrieval = 'retrieval',
  Reranking = 'reranking',
  Http = 'http', // Note: raw HTTP requests and responses
  Unknown = 'unknown', // Other spans we don't care about
  Prompt = 'prompt',
  Step = 'step',
}

export type SpanSpecification<T extends SpanType = SpanType> = {
  name: string
  description: string
  isGenAI: boolean
  isHidden: boolean
  _type?: T // TODO(tracing): required for type inference, remove this when something in the specification uses the type
}

export const SPAN_SPECIFICATIONS = {
  [SpanType.Tool]: {
    name: 'Tool',
    description: 'A tool call',
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Completion]: {
    name: 'Completion',
    description: 'A completion call',
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Embedding]: {
    name: 'Embedding',
    description: 'An embedding call',
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Retrieval]: {
    name: 'Retrieval',
    description: 'A retrieval call',
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Reranking]: {
    name: 'Reranking',
    description: 'A reranking call',
    isGenAI: true,
    isHidden: false,
  },
  [SpanType.Http]: {
    name: 'HTTP',
    description: 'An HTTP request',
    isGenAI: false,
    isHidden: true,
  },
  [SpanType.Unknown]: {
    name: 'Unknown',
    description: 'An unknown span',
    isGenAI: false,
    isHidden: true,
  },
  [SpanType.Prompt]: {
    name: 'Prompt',
    description: 'A prompt span',
    isGenAI: false,
    isHidden: false,
  },
  [SpanType.Step]: {
    name: 'Step',
    description: 'A step span',
    isGenAI: false,
    isHidden: false,
  },
} as const satisfies {
  [T in SpanType]: SpanSpecification<T>
}

export enum SpanStatus {
  Unset = 'unset',
  Ok = 'ok',
  Error = 'error',
}

// Note: get span attribute keys from @opentelemetry/semantic-conventions/incubating
export type SpanAttribute = string | number | boolean | SpanAttribute[]

export type SpanEvent = {
  name: string
  timestamp: Date
  attributes: Record<string, SpanAttribute>
}

export type SpanLink = {
  traceId: string
  spanId: string
  attributes: Record<string, SpanAttribute>
}

export type BaseSpanMetadata<T extends SpanType = SpanType> = {
  traceId: string
  spanId: string
  type: T
  attributes: Record<string, SpanAttribute>
  events: SpanEvent[]
  links: SpanLink[]
}

export type ToolSpanMetadata = BaseSpanMetadata<SpanType.Tool> & {
  name: string
  call: {
    id: string
    arguments: Record<string, unknown>
  }
  // Fields below are optional if the span had an error
  result?: {
    value: unknown
    isError: boolean
  }
}

export type PromptSpanMetadata = BaseSpanMetadata<SpanType.Prompt> & {
  experimentUuid: string
  externalId: string
  parameters: Record<string, unknown>
  promptUuid: string
  template: string
  versionUuid: string
  source: LogSources
}

export type CompletionSpanMetadata = BaseSpanMetadata<SpanType.Completion> & {
  provider: string
  model: string
  configuration: Record<string, unknown>
  input: Message[]
  // Fields below are optional if the span had an error
  output?: Message[]
  tokens?: {
    prompt: number
    cached: number
    reasoning: number
    completion: number
  }
  cost?: number // Enriched when ingested
  finishReason?: FinishReason
}

export type HttpSpanMetadata = BaseSpanMetadata<SpanType.Http> & {
  request: {
    method: string
    url: string
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
  // Fields below are optional if the span had an error
  response?: {
    status: number
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
}

// prettier-ignore
export type SpanMetadata<T extends SpanType = SpanType> =
  T extends SpanType.Tool ? ToolSpanMetadata :
  T extends SpanType.Prompt ? PromptSpanMetadata :
  T extends SpanType.Completion ? CompletionSpanMetadata :
  T extends SpanType.Embedding ? BaseSpanMetadata<T> :
  T extends SpanType.Retrieval ? BaseSpanMetadata<T> :
  T extends SpanType.Reranking ? BaseSpanMetadata<T> :
  T extends SpanType.Http ? HttpSpanMetadata :
  T extends SpanType.Unknown ? BaseSpanMetadata<T> :
  never;

export const SPAN_METADATA_STORAGE_KEY = (
  workspaceId: number,
  traceId: string,
  spanId: string,
) => encodeURI(`workspaces/${workspaceId}/traces/${traceId}/${spanId}`)
export const SPAN_METADATA_CACHE_TTL = 24 * 60 * 60 // 1 day

export type Span<T extends SpanType = SpanType> = {
  id: string
  traceId: string
  segmentId?: string
  parentId?: string // Parent span identifier
  workspaceId: number
  apiKeyId: number
  name: string
  kind: SpanKind
  type: T
  status: SpanStatus
  message?: string
  duration: number
  startedAt: Date
  endedAt: Date
  createdAt: Date
  updatedAt: Date
  documentLogUuid?: string
  documentUuid?: string
  commitUuid?: string
  experimentUuid?: string
  source?: LogSources
}

export type SpanWithDetails<T extends SpanType = SpanType> = Span<T> & {
  metadata?: SpanMetadata<T> // Metadata is optional if it could not be uploaded
}
