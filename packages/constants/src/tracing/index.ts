import { Message } from 'promptl-ai'
import { PromptConfig } from '../ai'

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
  AgentAsTool = 'agent_as_tool', // TODO(tracing): deprecated, use SpanType.Agent instead
  EmailTrigger = 'email_trigger',
  ScheduledTrigger = 'scheduled_trigger',
}

export enum SpanType {
  Workflow = 'workflow',
  Chain = 'chain',
  Agent = 'agent',
  Step = 'step',
  Tool = 'tool',
  Completion = 'completion',
  // TODO(tracing): add Embedding/Retrieval/Rerank types
  Unknown = 'unknown',
}

// Note: Prompt spans are Chain or Agent spans which are
// pseudo-Steps and can be singular Workflows by themselves
export type SpanTypePrompt = SpanType.Chain | SpanType.Agent

export enum SpanStatusCode {
  Unset = 'unset',
  Ok = 'ok',
  Error = 'error',
}

// Note: get Span Attribute keys from @opentelemetry/semantic-conventions/incubating
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

type BaseSpanMetadata = {
  id: string
  attributes: Record<string, SpanAttribute>
  events: SpanEvent[]
  links: SpanLink[]
}

type WorkflowSpanMetadata = BaseSpanMetadata & {}

type StepSpanMetadata = BaseSpanMetadata & {
  configuration: PromptConfig
  input: Message[]
  output: Message[]
}

type PromptSpanMetadata = BaseSpanMetadata &
  WorkflowSpanMetadata &
  StepSpanMetadata & {
    prompt: string
    parameters: Record<string, unknown>
  }

type ToolSpanMetadata = BaseSpanMetadata & {
  arguments: Record<string, unknown>
  result: Record<string, unknown>
}

type CompletionSpanMetadata = BaseSpanMetadata & {
  request: Record<string, unknown>
  response: Record<string, unknown>
}

// prettier-ignore
export type SpanMetadata<T extends SpanType = SpanType> =
  T extends SpanType.Workflow ? WorkflowSpanMetadata :
  T extends SpanTypePrompt ? PromptSpanMetadata :
  T extends SpanType.Step ? StepSpanMetadata :
  T extends SpanType.Tool ? ToolSpanMetadata :
  T extends SpanType.Completion ? CompletionSpanMetadata :
  T extends SpanType.Unknown ? BaseSpanMetadata :
  never;

type BaseSpan<T extends SpanType = SpanType> = {
  id: string
  workspaceId: number
  apiKeyId: number
  parentId?: string
  traceId: string
  externalId?: string // Custom user identifier
  name: string
  kind: SpanKind
  source: SpanSource
  type: T
  statusCode: SpanStatusCode
  statusMessage?: string
  metadata: SpanMetadata<T>
  duration?: number
  startedAt: Date
  endedAt?: Date
  createdAt: Date
  updatedAt: Date
}

type WorkflowSpan = BaseSpan<SpanType.Workflow> & {
  commitId: number
}

type StepSpan = BaseSpan<SpanType.Step> & {
  providerId: number
  model: string
  tokens: number
  cost: number
}

type PromptSpan<T extends SpanType = SpanTypePrompt> = BaseSpan<T> &
  Omit<WorkflowSpan, keyof BaseSpan<SpanType.Workflow>> &
  Omit<StepSpan, keyof BaseSpan<SpanType.Step>> & {
    documentUuid?: string
    evaluationUuid?: string
    experimentId?: number
    promptHash: string
  }

type ToolSpan = BaseSpan<SpanType.Tool>

type CompletionSpan = BaseSpan<SpanType.Completion>

// prettier-ignore
export type Span<T extends SpanType = SpanType> =
  T extends SpanType.Workflow ? WorkflowSpan :
  T extends SpanTypePrompt ? PromptSpan<T> :
  T extends SpanType.Step ? StepSpan :
  T extends SpanType.Tool ? ToolSpan :
  T extends SpanType.Completion ? CompletionSpan :
  T extends SpanType.Unknown ? BaseSpan<T> :
  never;
