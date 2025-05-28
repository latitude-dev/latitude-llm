import { Message } from 'promptl-ai'
import { DocumentType } from '../index'
import { LatitudePromptConfig } from '../latitudePromptSchema'
import { SpanSource, SpanStatusCode } from './span'

export enum SegmentType {
  Document = 'document',
  Evaluation = 'evaluation', // LLM evaluations generate spans but don't use documents underneath (yet)
  Step = 'step',
}

type BaseSegmentMetadata<T extends SegmentType = SegmentType> = {
  traceId: string
  segmentId: string
  type: T
}

type StepSegmentMetadata = BaseSegmentMetadata<SegmentType.Step> & {
  configuration: LatitudePromptConfig // Configuration of the current latitude document or first completion span that created this segment
  input: Message[] // Input messages of the first completion span that created this segment
  output: Message[] // Output messages of the last completion span that created this segment
}

type DocumentSegmentMetadata = BaseSegmentMetadata<SegmentType.Document> &
  Omit<StepSegmentMetadata, keyof BaseSegmentMetadata<SegmentType.Step>> & {
    prompt: string // Prompt (template) of the first completion span that created this segment
    parameters: Record<string, unknown> // Parameters of the first completion span that created this segment
  }

type EvaluationSegmentMetadata = BaseSegmentMetadata<SegmentType.Evaluation> &
  Omit<DocumentSegmentMetadata, keyof BaseSegmentMetadata<SegmentType.Document>>

// prettier-ignore
export type SegmentMetadata<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegmentMetadata :
  T extends SegmentType.Evaluation ? EvaluationSegmentMetadata :
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

export type BaseSegmentBaggage<T extends SegmentType = SegmentType> = {
  id: string
  parentId?: string
  name?: string
  type: T
}

type StepSegment = BaseSegment<SegmentType.Step> & {
  provider: string // Provider of the current latitude document or first completion span that created this segment
  model: string // Model of the current latitude document or first completion span that created this segment
  tokens: number // Aggregated tokens of all completion spans in the segment
  cost: number // Aggregated cost of all completion spans in the segment
}

type DocumentSegment = BaseSegment<SegmentType.Document> &
  Omit<StepSegment, keyof BaseSegment<SegmentType.Step>> & {
    documentRunUuid: string
    commitUuid: string
    documentUuid: string // When running an LLM evaluation this is the evaluation uuid
    documentHash: string // Prompt (template) hash of the first completion span that created this segment
    documentType: DocumentType // Prompt (template) type of the first completion span that created this segment
    experimentUuid?: string
  }

export type DocumentSegmentBaggage =
  BaseSegmentBaggage<SegmentType.Document> & {
    documentRunUuid: string
    versionUuid: string // Alias for commitUuid
    documentUuid: string
    experimentUuid?: string
  }

type EvaluationSegment = BaseSegment<SegmentType.Evaluation> &
  Omit<DocumentSegment, keyof BaseSegment<SegmentType.Document>>

export type EvaluationSegmentBaggage =
  BaseSegmentBaggage<SegmentType.Evaluation> &
    Omit<DocumentSegmentBaggage, keyof BaseSegmentBaggage<SegmentType.Document>>

// prettier-ignore
export type Segment<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegment :
  T extends SegmentType.Evaluation ? EvaluationSegment :
  T extends SegmentType.Step ? StepSegment :
  never;

// prettier-ignore
export type SegmentBaggage<T extends SegmentType = SegmentType> =
  T extends SegmentType.Document ? DocumentSegmentBaggage :
  T extends SegmentType.Evaluation ? EvaluationSegmentBaggage :
  T extends SegmentType.Step ? BaseSegmentBaggage<T> :
  never;

export type SegmentWithDetails<T extends SegmentType = SegmentType> =
  Segment<T> & {
    metadata: SegmentMetadata<T>
  }
