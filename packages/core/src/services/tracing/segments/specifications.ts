import { Segment, SegmentType } from '../../../browser'
import { SegmentBackendSpecification } from './shared'

// prettier-ignore
export const SEGMENT_SPECIFICATIONS: {
  [T in SegmentType]: SegmentBackendSpecification<T>
} = {
  [SegmentType.Document]: undefined as any, // TODO(tracing): implement
  [SegmentType.Step]: undefined as any, // TODO(tracing): implement
}

export function getSegmentSpecification<T extends SegmentType = SegmentType>(
  segment: Segment<T>,
) {
  return SEGMENT_SPECIFICATIONS[segment.type]
}
