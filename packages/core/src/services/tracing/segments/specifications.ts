import { Segment, SegmentType } from '../../../browser'
import { DocumentSegmentSpecification } from './document'
import { SegmentBackendSpecification } from './shared'
import { StepSegmentSpecification } from './step'

// prettier-ignore
export const SEGMENT_SPECIFICATIONS: {
  [T in SegmentType]: SegmentBackendSpecification<T>
} = {
  [SegmentType.Document]: DocumentSegmentSpecification,
  [SegmentType.Step]: StepSegmentSpecification,
}

export function getSegmentSpecification<T extends SegmentType = SegmentType>(
  segment: Segment<T>,
) {
  return SEGMENT_SPECIFICATIONS[segment.type]
}
