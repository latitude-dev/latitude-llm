'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { colors } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { memo, useMemo } from 'react'
import { SPAN_COLORS } from '$/components/tracing/spans/shared'
import { SPAN_SPECIFICATIONS } from '$/components/tracing/spans/specifications'
import {
  AssembledSpan,
  SpanStatus,
  SpanType,
} from '@latitude-data/core/constants'
import { TraceSection } from './ConversationTimeline'

const BAR_MIN_WIDTH = 0.5
const LABEL_MIN_WIDTH = 60

const GraphItem = memo(
  <T extends SpanType>({
    span,
    cumulativeOffset,
    totalDuration,
    traceWidth,
    isSelected,
    isCollapsed,
    selectSpan,
  }: {
    span: AssembledSpan<T>
    cumulativeOffset: number
    totalDuration: number
    traceWidth: number
    isSelected: boolean
    isCollapsed: boolean
    selectSpan: (span?: AssembledSpan) => void
  }) => {
    const specification = SPAN_SPECIFICATIONS[span.type]

    const barStyle = useMemo(() => {
      const adjustedStartOffset = span.startOffset + cumulativeOffset
      const startPercent = (adjustedStartOffset / totalDuration) * 100
      const widthPercent = (span.duration / totalDuration) * 100

      return {
        left: `${startPercent}%`,
        width: `${Math.max(widthPercent, BAR_MIN_WIDTH)}%`,
      }
    }, [span.startOffset, span.duration, cumulativeOffset, totalDuration])

    const labelStyle = useMemo(() => {
      const adjustedStartOffset = span.startOffset + cumulativeOffset
      const spanStartPercent = (adjustedStartOffset / totalDuration) * 100
      const spanWidthPercent = (span.duration / totalDuration) * 100
      const renderedWidthPercent = Math.max(spanWidthPercent, BAR_MIN_WIDTH)
      const spanEndPercent = spanStartPercent + renderedWidthPercent
      const spanWidthPixels = (span.duration / totalDuration) * traceWidth
      const isLabelInside = spanEndPercent > 85
      const isSpanWideEnough = spanWidthPixels > LABEL_MIN_WIDTH

      if (isLabelInside && isSpanWideEnough) {
        return {
          left: `${spanEndPercent}%`,
          transform: 'translateX(-100%)',
          marginLeft: '-8px',
          isVisuallyInside: true,
        }
      } else if (isLabelInside && !isSpanWideEnough) {
        return {
          left: `${spanStartPercent}%`,
          transform: 'translateX(-100%)',
          marginLeft: '-8px',
          isVisuallyInside: false,
        }
      }
      return {
        left: `${spanEndPercent}%`,
        transform: 'translateX(8px)',
        marginLeft: '0px',
        isVisuallyInside: false,
      }
    }, [
      span.startOffset,
      span.duration,
      cumulativeOffset,
      totalDuration,
      traceWidth,
    ])

    const colorScheme = useMemo(() => {
      if (span.status === SpanStatus.Error) {
        return {
          background: colors.backgrounds[SPAN_COLORS.red.background],
          border: colors.borderColors[SPAN_COLORS.red.border],
        }
      }

      return {
        background: colors.backgrounds[specification.color.background],
        border: colors.borderColors[specification.color.border],
      }
    }, [span.status, specification.color])

    return (
      <div className='relative w-full h-full'>
        <div
          className={cn(
            'absolute h-5 rounded-md cursor-pointer border top-1 hover:opacity-80 transition-opacity',
            colorScheme.background,
            colorScheme.border + (isSelected ? ' border-2' : '/10'),
            isCollapsed && 'border-dashed opacity-80',
          )}
          style={barStyle}
          onClick={() => {
            if (isSelected) selectSpan(undefined)
            else selectSpan(span)
          }}
        />
        <div
          className='absolute flex items-center top-1 h-5'
          style={labelStyle}
        >
          <Text.H6
            color={
              isSelected && labelStyle.isVisuallyInside
                ? 'accentForeground'
                : 'foregroundMuted'
            }
            userSelect={false}
            noWrap={true}
          >
            {formatDuration(span.duration)}
          </Text.H6>
        </div>
      </div>
    )
  },
)

export function ConversationGraph({
  sections,
  totalDuration,
  width,
  minWidth,
  selectedSpan,
  selectSpan,
  collapsedSpans,
}: {
  sections: TraceSection[]
  totalDuration: number
  width: number
  minWidth: number
  selectedSpan?: AssembledSpan
  selectSpan: (span?: AssembledSpan) => void
  collapsedSpans: Set<string>
}) {
  const flattenedSpans = useMemo(() => {
    const result: Array<{
      span: AssembledSpan
      cumulativeOffset: number
    }> = []

    sections.forEach((section) => {
      const flatten = (span: AssembledSpan) => {
        result.push({ span, cumulativeOffset: section.cumulativeOffset })
        if (!collapsedSpans.has(span.id)) {
          span.children.forEach(flatten)
        }
      }
      section.trace.children.forEach(flatten)
    })

    return result
  }, [sections, collapsedSpans])

  if (flattenedSpans.length === 0) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4'>
        <Text.H5 color='foregroundMuted'>No events found so far</Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full h-full flex flex-col pt-2'>
      <div className='w-full h-full overflow-x-auto'>
        <div
          className='flex flex-col h-full'
          style={{ minWidth: `${minWidth}px` }}
        >
          <div className='flex-1'>
            <div className='relative w-full'>
              {flattenedSpans.map((item) => (
                <div
                  key={`${item.span.traceId}-${item.span.id}`}
                  className='h-7 flex items-center border-b border-border/50 last:border-b-0'
                >
                  <div className='relative w-full h-full px-2'>
                    <GraphItem
                      span={item.span}
                      cumulativeOffset={item.cumulativeOffset}
                      totalDuration={totalDuration}
                      traceWidth={width}
                      isSelected={selectedSpan?.id === item.span.id}
                      isCollapsed={collapsedSpans.has(item.span.id)}
                      selectSpan={selectSpan}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
