import { FinishReason } from 'ai'
import { LogSources } from '../models'
import { AssembledSpan } from './trace'
import { Message } from '../messages'

export enum SpanKind {
  Internal = 'internal',
  Server = 'server',
  Client = 'client',
  Producer = 'producer',
  Consumer = 'consumer',
}

// Note: loosely based on OpenTelemetry GenAI semantic conventions
export enum SpanType {
  // Latitude wrappers
  Prompt = 'prompt', // Running a prompt
  Chat = 'chat', // Continuing a conversation (adding messages)
  External = 'external', // Wrapping external generation code
  UnresolvedExternal = 'unresolved_external', // External span that needs path & potential version resolution

  // Added a HTTP span to capture raw HTTP requests and responses when running from Latitude
  Http = 'http', // Note: raw HTTP requests and responses

  // Any known span from supported specifications will be grouped into one of these types
  Completion = 'completion',
  Tool = 'tool', // Note: asynchronous tools such as agents are conversation segments
  Embedding = 'embedding',

  Unknown = 'unknown', // Other spans we don't care about
}

export type SpanSpecification<_T extends SpanType = SpanType> = {
  name: string
  description: string
  isGenAI: boolean
  isHidden: boolean
}

export const LIVE_EVALUABLE_SPAN_TYPES = [
  SpanType.Prompt,
  SpanType.External,
  SpanType.Chat,
]

export type EvaluableSpanType =
  | SpanType.Prompt
  | SpanType.Chat
  | SpanType.External

export const SPAN_SPECIFICATIONS = {
  [SpanType.Prompt]: {
    name: 'Prompt',
    description: 'A prompt span',
    isGenAI: false,
    isHidden: false,
  },
  [SpanType.Chat]: {
    name: 'Chat',
    description: 'A chat continuation span',
    isGenAI: false,
    isHidden: false,
  },
  [SpanType.External]: {
    name: 'External',
    description: 'An external capture span',
    isGenAI: false,
    isHidden: false,
  },
  [SpanType.UnresolvedExternal]: {
    name: 'Unresolved External',
    description: 'An external span that needs path resolution before storage',
    isGenAI: false,
    isHidden: true,
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
  [SpanType.Tool]: {
    name: 'Tool',
    description: 'A tool call',
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

export type SpanReferenceMetadata = {
  source?: LogSources
  documentLogUuid?: string
  promptUuid?: string
  versionUuid?: string
  experimentUuid?: string
  projectId?: number
  testDeploymentId?: number
  previousTraceId?: string
}

export type ToolSpanMetadata = BaseSpanMetadata<SpanType.Tool> &
  SpanReferenceMetadata & {
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

export type PromptSpanMetadata = BaseSpanMetadata<SpanType.Prompt> &
  SpanReferenceMetadata & {
    documentLogUuid: string
    experimentUuid: string
    externalId: string
    parameters: Record<string, unknown>
    projectId: number
    promptUuid: string
    source: LogSources
    template: string
    testDeploymentId?: number
    versionUuid: string
  }

export type ChatSpanMetadata = BaseSpanMetadata<SpanType.Chat> &
  SpanReferenceMetadata & {
    documentLogUuid: string
    previousTraceId: string
    source: LogSources
  }

export type ExternalSpanMetadata = BaseSpanMetadata<SpanType.External> &
  SpanReferenceMetadata & {
    promptUuid: string
    documentLogUuid: string
    source: LogSources
    versionUuid?: string
    externalId?: string
    name?: string
  }

export type UnresolvedExternalSpanMetadata =
  BaseSpanMetadata<SpanType.UnresolvedExternal> &
    SpanReferenceMetadata & {
      promptPath: string
      projectId: number
      versionUuid?: string
      externalId?: string
      name?: string
    }

export type CompletionSpanMetadata = BaseSpanMetadata<SpanType.Completion> &
  SpanReferenceMetadata & {
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

export type HttpSpanMetadata = BaseSpanMetadata<SpanType.Http> &
  SpanReferenceMetadata & {
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
  T extends SpanType.Chat ? ChatSpanMetadata :
  T extends SpanType.External ? ExternalSpanMetadata :
  T extends SpanType.UnresolvedExternal ? UnresolvedExternalSpanMetadata :
  T extends SpanType.Completion ? CompletionSpanMetadata :
  T extends SpanType.Embedding ? BaseSpanMetadata<T> & SpanReferenceMetadata :
  T extends SpanType.Http ? HttpSpanMetadata :
  T extends SpanType.Unknown ? BaseSpanMetadata<T> & SpanReferenceMetadata :
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
  projectId: number
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
  testDeploymentId?: number
  previousTraceId?: string

  source?: LogSources

  tokensPrompt?: number
  tokensCached?: number
  tokensReasoning?: number
  tokensCompletion?: number

  model?: string
  cost?: number
}

export type PromptSpan = Omit<Span<SpanType.Prompt>, 'documentLogUuid'> & {
  documentLogUuid: string
}

export type ChatSpan = Omit<Span<SpanType.Chat>, 'documentLogUuid'> & {
  documentLogUuid: string
}

export type ExternalSpan = Omit<Span<SpanType.External>, 'documentLogUuid'> & {
  documentLogUuid: string
}

export type SpanWithDetails<T extends SpanType = SpanType> = Span<T> & {
  metadata?: SpanMetadata<T> // Metadata is optional if it could not be uploaded
}

export type SerializedSpanPair = {
  id: string
  traceId: string
  createdAt: string
}

export type MainSpanType = SpanType.External | SpanType.Prompt | SpanType.Chat
export const MAIN_SPAN_TYPES = new Set([
  SpanType.Prompt,
  SpanType.Chat,
  SpanType.External,
])

export type MainSpanMetadata =
  | PromptSpanMetadata
  | ChatSpanMetadata
  | ExternalSpanMetadata

export function isMainSpan(span: Span | SpanWithDetails | AssembledSpan) {
  return MAIN_SPAN_TYPES.has(span.type)
}

export function isCompletionSpan(
  span: Span | SpanWithDetails | AssembledSpan,
): span is AssembledSpan<SpanType.Completion> {
  return span.type === SpanType.Completion
}
