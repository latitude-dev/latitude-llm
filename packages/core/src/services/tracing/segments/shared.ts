import { isAfter, isBefore, isEqual } from 'date-fns'
import {
  ApiKey,
  BaseSegmentMetadata,
  Commit,
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  SegmentBaggage,
  SegmentMetadata,
  SegmentSpecification,
  SegmentType,
  SegmentWithDetails,
  SpanType,
  SpanWithDetails,
  Workspace,
} from '../../../browser'
import { Database } from '../../../client'
import { TypedResult } from '../../../lib/Result'
import { hashContent as hash } from '../../../lib/hashContent'

type Timestamps = { first: Date; last: Date }

export type SegmentProcessArgs<T extends SegmentType = SegmentType> = {
  segment: SegmentBaggage<T>
  chain: SegmentBaggage[]
  child: SpanWithDetails | SegmentWithDetails
  traceId: string
  current?: SegmentWithDetails<T> & {
    children?: Timestamps
    completions?: Timestamps
    documents?: Timestamps
    errors?: Timestamps
  }
  run?: SegmentWithDetails<SegmentType.Document>
  document?: DocumentVersion & {
    config: Record<string, unknown>
  }
  evaluation?: EvaluationV2<EvaluationType.Llm>
  commit: Commit
  apiKey: ApiKey
  workspace: Workspace
}

export type SegmentBackendSpecification<T extends SegmentType = SegmentType> =
  SegmentSpecification<T> & {
    process: (
      args: SegmentProcessArgs<T>,
      db?: Database,
    ) => Promise<
      TypedResult<Omit<SegmentMetadata<T>, keyof BaseSegmentMetadata<T>>>
    >
  }

export function inheritField<T = unknown>(
  field: string,
  chain: Record<string, unknown>[],
): T | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    const segment = chain[i]!
    if (field in segment) return segment[field] as T
    if (
      'data' in segment &&
      segment.data &&
      typeof segment.data === 'object' &&
      field in segment.data
    ) {
      return (segment.data as Record<string, unknown>)[field] as T
    }
  }

  return undefined
}

export function hashContent(content?: string) {
  return content ? hash(content) : undefined
}

type TimestampsOption = 'children' | 'completions' | 'documents' | 'errors'

export function isFirst(
  current: SegmentProcessArgs['current'],
  child: SegmentProcessArgs['child'],
  comparison: TimestampsOption,
) {
  if (!current) return true
  if (!current[comparison]?.first) return true
  if (isEqual(child.startedAt, current[comparison].first)) return true
  if (isBefore(child.startedAt, current[comparison].first)) return true
  return false
}

export function isLast(
  current: SegmentProcessArgs['current'],
  child: SegmentProcessArgs['child'],
  comparison: TimestampsOption,
) {
  if (!current) return true
  if (!current[comparison]?.last) return true
  if (isEqual(child.startedAt, current[comparison].last)) return true
  if (isAfter(child.startedAt, current[comparison].last)) return true
  return false
}

export type CompletionPart =
  | SpanWithDetails<SpanType.Completion>
  | SegmentWithDetails<SegmentType.Document>
  | SegmentWithDetails<SegmentType.Step>

export const isCompletionPart = (child: SegmentProcessArgs['child']) =>
  child.type === SpanType.Completion ||
  child.type === SegmentType.Document ||
  child.type === SegmentType.Step
