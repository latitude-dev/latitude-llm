import { Message } from 'promptl-ai'
import { z } from 'zod'
import { DocumentType } from '../index'
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

export type SegmentSpecification<T extends SegmentType = SegmentType> = {
  name: string
  description: string
  _type?: T // TODO(tracing): required for type inference, remove this when something in the specification uses the type
}

export const SEGMENT_SPECIFICATIONS = {
  [SegmentType.Document]: {
    name: 'Prompt',
    description: 'A prompt',
  },
  [SegmentType.Step]: {
    name: 'Step',
    description: 'A step in a prompt',
  },
} as const satisfies {
  [T in SegmentType]: SegmentSpecification<T>
}

export type BaseSegmentMetadata<T extends SegmentType = SegmentType> = {
  traceId: string
  segmentId: string
  type: T
}

export type StepSegmentMetadata = BaseSegmentMetadata<SegmentType.Step> & {
  configuration: Record<string, unknown> // From the first completion span/segment
  input: Message[] // From the first completion span/segment
  // Fields below are optional if the spans had an error
  output?: Message[] // From the last completion span/segment
}

export type DocumentSegmentMetadata =
  BaseSegmentMetadata<SegmentType.Document> &
    Omit<StepSegmentMetadata, keyof BaseSegmentMetadata<SegmentType.Step>> & {
      prompt: string // From first segment span/segment or current run or document
      parameters: Record<string, unknown> // From first segment span/segment or current run
    }

// prettier-ignore
export type SegmentMetadata<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegmentMetadata :
  T extends SegmentType.Step ? StepSegmentMetadata :
  never;

export const SEGMENT_METADATA_STORAGE_KEY = (
  workspaceId: number,
  traceId: string,
  segmentId: string,
) => encodeURI(`workspaces/${workspaceId}/traces/${traceId}/${segmentId}`)
export const SEGMENT_METADATA_CACHE_TTL = 1 * 60 // 1 hour

export type Segment<T extends SegmentType = SegmentType> = {
  id: string
  traceId: string
  parentId?: string // Parent segment identifier
  workspaceId: number
  apiKeyId: number
  externalId?: string // Custom user identifier from current or inherited from parent
  name: string // Enriched when ingested
  source: SegmentSource // From current or inherited from parent
  type: T
  status: SpanStatus // From the last span/segment (errored spans have priority)
  message?: string // From the last span/segment (errored spans have priority)
  logUuid?: string // TODO(tracing): temporal related log, remove when observability is ready
  commitUuid: string // From current or inherited from parent
  documentUuid: string // From current or inherited from parent. When running an llm evaluation this is the evaluation uuid and source is Evaluation
  documentHash: string // From current run or document
  documentType: DocumentType // From current run or document
  experimentUuid?: string // From current or inherited from parent
  provider: string // From first completion span/segment or current run or document
  model: string // From first completion span/segment or current run or document
  tokens: number // Aggregated tokens from all completion spans/segments
  cost: number // Aggregated cost from all completion spans/segments
  duration: number // Elapsed time between the first and last span/segment
  startedAt: Date // From the first span/segment
  endedAt: Date // From the last span/segment
  createdAt: Date
  updatedAt: Date
}

export type SegmentWithDetails<T extends SegmentType = SegmentType> =
  Segment<T> & {
    metadata?: SegmentMetadata<T> // Metadata is optional if the segment has not ended, had an early error or it could not be uploaded
  }

const baseSegmentBaggageSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  source: z.nativeEnum(SegmentSource),
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
