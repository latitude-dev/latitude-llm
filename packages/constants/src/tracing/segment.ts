import { Message } from 'promptl-ai'
import { z } from 'zod'
import { DocumentType } from '../index'
import { LatitudePromptConfig } from '../latitudePromptSchema'
import { SpanSource, SpanStatus } from './span'

export enum SegmentType {
  Conversation = 'conversation',
  Interaction = 'interaction',
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

type InteractionSegmentMetadata = BaseSegmentMetadata<SegmentType.Interaction> &
  Omit<StepSegmentMetadata, keyof BaseSegmentMetadata<SegmentType.Step>>

type ConversationSegmentMetadata =
  BaseSegmentMetadata<SegmentType.Conversation> &
    Omit<StepSegmentMetadata, keyof BaseSegmentMetadata<SegmentType.Step>> & {
      prompt: string // From the first completion span
      parameters: Record<string, unknown> // From the first completion span
    }

// prettier-ignore
export type SegmentMetadata<T extends SegmentType = SegmentType> =
  T extends SegmentType.Conversation ? ConversationSegmentMetadata :
  T extends SegmentType.Interaction ? InteractionSegmentMetadata :
  T extends SegmentType.Step ? StepSegmentMetadata :
  never;

export type Segment<T extends SegmentType = SegmentType> = {
  id: string
  traceId: string
  parentId?: string // Parent segment identifier
  workspaceId: number
  apiKeyId: number
  externalId?: string // Custom user identifier from the first span
  name: string // Enriched when ingested
  source: SpanSource // From the first span
  type: T
  status: SpanStatus // From the last span (errored spans have priority)
  message?: string // From the last span (errored spans have priority)
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
    metadata?: SegmentMetadata<T> // Metadata is optional if the segment has not ended or it could not be uploaded
  }

const baseSegmentBaggageSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
})
export const segmentBaggageSchema = z.discriminatedUnion('type', [
  baseSegmentBaggageSchema.extend({
    type: z.literal(SegmentType.Conversation),
    data: z.object({
      commitUuid: z.string(),
      documentUuid: z.string(),
      experimentUuid: z.string().optional(),
    }),
  }),
  baseSegmentBaggageSchema.extend({
    type: z.literal(SegmentType.Interaction),
  }),
  baseSegmentBaggageSchema.extend({
    type: z.literal(SegmentType.Step),
  }),
])

// prettier-ignore
export type SegmentBaggage<T extends SegmentType = SegmentType> = Extract<z.infer<typeof segmentBaggageSchema>, { type: T }>
