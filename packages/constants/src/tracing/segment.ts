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
  output: Message[] // From the last completion span
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
  name: string
  source: SpanSource // From the first span
  type: T
  status: SpanStatus // From the last span (errored spans have priority)
  message?: string // From the last span (errored spans have priority)
  commitUuid: string // From the first span
  documentUuid: string // From the first span. When running an llm evaluation this is the evaluation uuid and source is Evaluation
  documentHash: string // From the first completion span or current document
  documentType: DocumentType // From the first completion span or current document
  experimentUuid?: string // From the first span
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
    metadata: SegmentMetadata<T>
  }

export const segmentBaggageSchema = z.object({
  id: z.string(),
  // Note: traceId is potentially unknown when the root segment is created
  parentId: z.string().optional(),
  name: z.string(),
  type: z.nativeEnum(SegmentType),
  commitUuid: z.string(),
  documentUuid: z.string(),
  experimentUuid: z.string().optional(),
})
export type SegmentBaggage = z.infer<typeof segmentBaggageSchema>
