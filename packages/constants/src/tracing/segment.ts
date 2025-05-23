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
  configuration: LatitudePromptConfig
  input: Message[]
  output: Message[]
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
  updatedAt: Date
}

export type BaseSegmentBaggage<T extends SegmentType = SegmentType> = Pick<
  BaseSegment<T>,
  'id' | 'parentId' | 'type'
> &
  Partial<Pick<BaseSegment<T>, 'name'>>

type StepSegment = BaseSegment<SegmentType.Step> & {
  provider: string // Provider of the first span that created this segment
  model: string // Model of the first span that created this segment
  tokens: number // Aggregated tokens of all spans in the segment
  cost: number // Aggregated cost of all spans in the segment
}

type DocumentSegment = BaseSegment<SegmentType.Document> &
  Omit<StepSegment, keyof BaseSegment<SegmentType.Step>> & {
    versionUuid: string // Commit uuid of the first span that created this segment
    documentUuid: string // Document uuid of the first span that created this segment. When running an LLM evaluation this is the evaluation uuid
    documentType: DocumentType // Document type of the first span that created this segment
    experimentUuid?: string // Experiment uuid of the first span that created this segment
    promptHash: string // Document content hash of the first span that created this segment
  }

export type DocumentSegmentBaggage = BaseSegmentBaggage<SegmentType.Document> &
  Pick<DocumentSegment, 'documentUuid'> &
  Partial<
    Pick<
      DocumentSegment,
      'versionUuid' | 'documentType' | 'experimentUuid' | 'promptHash'
    >
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
