export enum SpanKind {
  Internal = 'internal',
  Server = 'server',
  Client = 'client',
  Producer = 'producer',
  Consumer = 'consumer',
}

export enum SpanSource {
  API = 'api',
  Playground = 'playground',
  Evaluation = 'evaluation', // Note: spans generated from prompts of llm evaluations
  Experiment = 'experiment',
  User = 'user',
  SharedPrompt = 'shared_prompt',
  AgentAsTool = 'agent_as_tool', // TODO(tracing): deprecated, use SegmentType.Conversation with DocumentType.Agent instead
  EmailTrigger = 'email_trigger',
  ScheduledTrigger = 'scheduled_trigger',
}

// Note: loosely based on OpenTelemetry GenAI semantic conventions
export enum SpanType {
  Tool = 'tool', // Note: asynchronous tools such as agents are conversation segments
  Completion = 'completion',
  Embedding = 'embedding',
  Retrieval = 'retrieval',
  Reranking = 'reranking',
  Http = 'http', // Note: raw HTTP requests and responses
  Unknown = 'unknown', // Other spans we don't care about. They are also used as wrappers so spans belong to the same trace.
}

export enum SpanStatus {
  Unset = 'unset',
  Ok = 'ok',
  Error = 'error',
}

// Note: get span attribute keys from @opentelemetry/semantic-conventions/incubating
export type SpanAttribute = string | number | boolean

export type SpanEvent = {
  name: string
  timestamp: Date
  attributes?: Record<string, SpanAttribute>
}

export type SpanLink = {
  traceId: string
  spanId: string
  attributes?: Record<string, SpanAttribute>
}

type BaseSpanMetadata<T extends SpanType = SpanType> = {
  traceId: string
  spanId: string
  type: T
  attributes: Record<string, SpanAttribute>
  events: SpanEvent[]
  links: SpanLink[]
}

type ToolSpanMetadata = BaseSpanMetadata<SpanType.Tool> & {
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

type CompletionSpanMetadata = BaseSpanMetadata<SpanType.Completion> & {
  provider: string
  model: string
  configuration: Record<string, unknown>
  template: string
  parameters: Record<string, unknown>
  input: Record<string, unknown>[]
  // Fields below are optional if the span had an error
  output?: Record<string, unknown>[]
  tokens?: {
    prompt: number
    cached: number
    reasoning: number
    completion: number
  }
  cost?: number // Enriched when ingested
  finishReason?: string
}

type HttpSpanMetadata = BaseSpanMetadata<SpanType.Http> & {
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
  T extends SpanType.Completion ? CompletionSpanMetadata :
  T extends SpanType.Embedding ? BaseSpanMetadata<T> :
  T extends SpanType.Retrieval ? BaseSpanMetadata<T> :
  T extends SpanType.Reranking ? BaseSpanMetadata<T> :
  T extends SpanType.Http ? HttpSpanMetadata :
  T extends SpanType.Unknown ? BaseSpanMetadata<T> :
  never;

export type Span<T extends SpanType = SpanType> = {
  id: string
  traceId: string
  segmentId?: string
  parentId?: string // Parent span identifier
  workspaceId: number
  apiKeyId: number
  externalId?: string // Custom user identifier
  name: string
  kind: SpanKind
  source: SpanSource
  type: T
  status: SpanStatus
  message?: string
  duration: number
  startedAt: Date
  endedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type SpanWithDetails<T extends SpanType = SpanType> = Span<T> & {
  metadata?: SpanMetadata<T> // Metadata is optional if it could not be uploaded
}
