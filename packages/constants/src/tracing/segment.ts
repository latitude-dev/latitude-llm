import { Message } from 'promptl-ai'
import { z } from 'zod'
import { DocumentType } from '../index'
import { LatitudePromptConfig } from '../latitudePromptSchema'
import { SpanStatus } from './span'

export enum SegmentSource {
  API = 'api',
  Playground = 'playground',
  Evaluation = 'evaluation', // Note: from prompts of llm evaluations
  Experiment = 'experiment',
  User = 'user',
  SharedPrompt = 'shared_prompt',
  AgentAsTool = 'agent_as_tool', // TODO(tracing): deprecated, use SegmentType.Document with DocumentType.Agent instead
  EmailTrigger = 'email_trigger',
  ScheduledTrigger = 'scheduled_trigger',
}

export enum SegmentType {
  Document = 'document',
  Step = 'step',
}

type BaseSegmentMetadata<T extends SegmentType = SegmentType> = {
  traceId: string
  segmentId: string
  type: T
}

type StepSegmentMetadata = BaseSegmentMetadata<SegmentType.Step> & {
  configuration: LatitudePromptConfig // From the first completion span
  input: Message[] // From the first completion span
  // Fields below are optional if the spans had an error
  output?: Message[] // From the last completion span
}

type DocumentSegmentMetadata = BaseSegmentMetadata<SegmentType.Document> &
  Omit<StepSegmentMetadata, keyof BaseSegmentMetadata<SegmentType.Step>> & {
    prompt: string // From the first completion span
    parameters: Record<string, unknown> // From the first completion span
  }

// prettier-ignore
export type SegmentMetadata<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegmentMetadata :
  T extends SegmentType.Step ? StepSegmentMetadata :
  never;

export type Segment<T extends SegmentType = SegmentType> = {
  id: string
  traceId: string
  parentId?: string // Parent segment identifier
  workspaceId: number
  apiKeyId: number
  externalId?: string // Custom user identifier from the first span or inherited from parent
  name: string // Enriched when ingested
  source: SegmentSource // From the first span or inherited from parent
  type: T
  status: SpanStatus // From the last span (errored spans have priority)
  message?: string // From the last span (errored spans have priority)
  logUuid?: string // TODO(tracing): temporal related log, remove when observability is ready
  commitUuid: string // From the first span or inherited from parent
  documentUuid: string // From the first span or inherited from parent. When running an llm evaluation this is the evaluation uuid and source is Evaluation
  documentHash: string // From the first completion span or current document
  documentType: DocumentType // From the first completion span or current document
  experimentUuid?: string // From the first span or inherited from parent
  provider: string // From the first completion span or current document
  model: string // From the first completion span or current document
  tokens: number // Aggregated tokens from all completion spans
  cost: number // Aggregated cost from all completion spans
  duration: number // Elapsed time between the first and last span
  startedAt: Date
  endedAt?: Date // From the last span when the segment is closed
  createdAt: Date
  updatedAt: Date
}

export type SegmentWithDetails<T extends SegmentType = SegmentType> =
  Segment<T> & {
    metadata?: SegmentMetadata<T> // Metadata is optional if the segment has not ended, had an early error or it could not be uploaded
  }

// TODO(tracing): should this have the trace context per segment?
const baseSegmentBaggageSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  source: z.nativeEnum(SegmentSource),
  paused: z.boolean().optional(),
})
export const segmentBaggageSchema = z.discriminatedUnion('type', [
  baseSegmentBaggageSchema.extend({
    type: z.literal(SegmentType.Document),
    data: z.object({
      logUuid: z.string().optional(), // TODO(tracing): temporal related log, remove when observability is ready
      commitUuid: z.string(),
      documentUuid: z.string(),
      experimentUuid: z.string().optional(),
      externalId: z.string().optional(),
    }),
  }),
  baseSegmentBaggageSchema.extend({
    type: z.literal(SegmentType.Step),
    data: z.undefined().optional(),
  }),
])

// prettier-ignore
export type SegmentBaggage<T extends SegmentType = SegmentType> = Extract<z.infer<typeof segmentBaggageSchema>, { type: T }>
