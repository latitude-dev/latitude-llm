import {
  Segment,
  SegmentSpecification,
  SegmentType,
  SegmentWithDetails,
} from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import React from 'react'

export type TimelineItemProps<T extends SegmentType = SegmentType> = {
  segment: Segment<T>
}

export type DetailsPanelProps<T extends SegmentType = SegmentType> = {
  segment: SegmentWithDetails<T>
}

export type SegmentFrontendSpecification<T extends SegmentType = SegmentType> =
  SegmentSpecification<T> & {
    icon: IconName
    TimelineItem: (props: TimelineItemProps<T>) => React.ReactNode
    DetailsPanel: (props: DetailsPanelProps<T>) => React.ReactNode
  }

// prettier-ignore
export const SEGMENT_SPECIFICATIONS: {
  [T in SegmentType]: SegmentFrontendSpecification<T>
} = {
  [SegmentType.Document]: undefined as any, // TODO(tracing): implement
  [SegmentType.Step]: undefined as any, // TODO(tracing): implement
}

export function getSegmentSpecification<T extends SegmentType = SegmentType>(
  segment: Segment<T>,
) {
  return SEGMENT_SPECIFICATIONS[segment.type]
}
