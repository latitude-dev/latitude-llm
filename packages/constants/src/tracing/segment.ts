import { Message } from 'promptl-ai'
import { DocumentType } from '../index'
import { LatitudePromptConfig } from '../latitudePromptSchema'
import { SpanSource, SpanStatusCode } from './span'

export enum SegmentType {
  Document = 'document',
  Step = 'step',
}

type BaseSegmentMetadata = {
  traceId: string
  segmentId: string
}

type StepSegmentMetadata = BaseSegmentMetadata & {
  configuration: LatitudePromptConfig // Configuration of the current latitude document or first completion span that created this segment
  input: Message[] // Input messages of the first completion span that created this segment
  output: Message[] // Output messages of the last completion span that created this segment
}

type DocumentSegmentMetadata = BaseSegmentMetadata &
  StepSegmentMetadata & {
    prompt: string
    parameters: Record<string, unknown>
  }

// prettier-ignore
export type SegmentMetadata<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegmentMetadata :
  T extends SegmentType.Step ? StepSegmentMetadata :
  never;

type BaseSegment<T extends SegmentType = SegmentType> = {
  id: string
  workspaceId: number
  apiKeyId: number
  traceId: string
  parentId?: string // Parent segment identifier
  externalId?: string // Custom user identifier of the first span that created this segment
  name: string
  source: SpanSource // Source of the first span that created this segment
  type: T
  statusCode: SpanStatusCode // Status code of the last span in the segment (errored spans have priority)
  statusMessage?: string // Status message of the last span in the segment (errored spans have priority)
  duration: number // Elapsed time between the first and last span in the segment
  startedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type BaseSegmentBaggage<T extends SegmentType = SegmentType> = Pick<
  BaseSegment<T>,
  'id' | 'parentId' | 'type'
> &
  Partial<Pick<BaseSegment<T>, 'name'>>

type StepSegment = BaseSegment<SegmentType.Step> & {
  provider: string // Provider of the current latitude document or first completion span that created this segment
  model: string // Model of the current latitude document or first completion span that created this segment
  tokens: number // Aggregated tokens of all completion spans in the segment
  cost: number // Aggregated cost of all completion spans in the segment
}

type DocumentSegment = BaseSegment<SegmentType.Document> &
  Omit<StepSegment, keyof BaseSegment<SegmentType.Step>> & {
    commitUuid: string
    documentUuid: string // When running an LLM evaluation this is the evaluation uuid
    documentType: DocumentType
    experimentUuid?: string
    promptHash: string
  }

export type DocumentSegmentBaggage = BaseSegmentBaggage<SegmentType.Document> &
  Pick<DocumentSegment, 'documentUuid'> &
  Partial<
    Pick<DocumentSegment, 'documentType' | 'experimentUuid' | 'promptHash'> & {
      versionUuid: string // Alias for commitUuid
    }
  >

// prettier-ignore
export type Segment<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegment :
  T extends SegmentType.Step ? StepSegment :
  never;

// prettier-ignore
export type SegmentBaggage<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegmentBaggage :
  T extends SegmentType.Step ? BaseSegmentBaggage<T> :
  never;

export type SegmentWithDetails<T extends SegmentType = SegmentType> =
  Segment<T> & {
    metadata: SegmentMetadata<T>
  }
