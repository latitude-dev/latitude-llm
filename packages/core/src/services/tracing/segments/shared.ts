import {
  ApiKey,
  SegmentBaggage,
  SegmentMetadata,
  SegmentSpecification,
  SegmentType,
  Span,
  Workspace,
} from '../../../browser'
import { Database } from '../../../client'
import { TypedResult } from '../../../lib/Result'

export type SegmentProcessArgs<T extends SegmentType = SegmentType> = {
  baggage: SegmentBaggage<T>
  span: Span
  apiKey: ApiKey
  workspace: Workspace
}

export type SegmentBackendSpecification<T extends SegmentType = SegmentType> =
  SegmentSpecification<T> & {
    process: (
      args: SegmentProcessArgs<T>,
      db?: Database,
    ) => Promise<TypedResult<SegmentMetadata<T>>>
  }
