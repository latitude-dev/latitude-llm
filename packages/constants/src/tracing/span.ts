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
  Evaluation = 'evaluation',
  Experiment = 'experiment',
  User = 'user',
  SharedPrompt = 'shared_prompt',
  AgentAsTool = 'agent_as_tool', // TODO(tracing): deprecated, use SegmentType.Agent instead
  EmailTrigger = 'email_trigger',
  ScheduledTrigger = 'scheduled_trigger',
}

// Note: loosely based on OpenTelemetry GenAI semantic conventions
export enum SpanType {
  Tool = 'tool', // Note: asynchronous tools such as agents are document segments
  Completion = 'completion',
  Embedding = 'embedding',
  Retrieval = 'retrieval',
  Reranking = 'reranking',
  Http = 'http', // Note: raw HTTP requests and responses
  Unknown = 'unknown', // Other spans we don't care about. They are also used as wrappers so spans belong to the same trace.
}

export enum SpanStatusCode {
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

export type BaseSpanMetadata = {
  traceId: string
  spanId: string
  attributes: Record<string, SpanAttribute>
  events: SpanEvent[]
  links: SpanLink[]
}

export type ToolSpanMetadata = BaseSpanMetadata & {
  name: string
  call: {
    id: string
    arguments: Record<string, unknown>
    result:
      | {
          value: Required<any>
          error: undefined
        }
      | {
          value: undefined
          error: Required<any>
        }
  }
}

export type CompletionSpanMetadata = BaseSpanMetadata & {
  provider: string
  model: string
  tokens: {
    input: number
    output: number
  }
  cost: number
  configuration: Record<string, unknown>
  input: Record<string, unknown>[]
  output: Record<string, unknown>[]
  finishReason: string
}

export type HttpSpanMetadata = BaseSpanMetadata & {
  request: {
    method: string
    url: string
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
  response: {
    status: number
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
}

// prettier-ignore
export type SpanMetadata<T extends SpanType = SpanType> =
  T extends SpanType.Tool ? ToolSpanMetadata :
  T extends SpanType.Completion ? CompletionSpanMetadata :
  T extends SpanType.Embedding ? BaseSpanMetadata :
  T extends SpanType.Retrieval ? BaseSpanMetadata :
  T extends SpanType.Reranking ? BaseSpanMetadata :
  T extends SpanType.Http ? HttpSpanMetadata :
  T extends SpanType.Unknown ? BaseSpanMetadata :
  never;

export type Span<T extends SpanType = SpanType> = {
  id: string
  workspaceId: number
  apiKeyId: number
  traceId: string
  segmentId?: string
  parentId?: string // Parent span identifier
  externalId?: string // Custom user identifier
  name: string
  kind: SpanKind
  source: SpanSource
  type: T
  statusCode: SpanStatusCode
  statusMessage?: string
  duration: number
  startedAt: Date
  endedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type SpanWithDetails<T extends SpanType = SpanType> = Span<T> & {
  metadata: SpanMetadata<T>
}
