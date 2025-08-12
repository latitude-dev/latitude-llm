import { formatDuration } from '$/app/_lib/formatUtils'
import {
  AssembledSpan,
  AssembledTrace,
  SpanStatus,
  SpanType,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { colors } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { memo, useMemo } from 'react'
import { SPAN_COLORS } from '../../spans/shared'
import { SPAN_SPECIFICATIONS } from '../../spans/specifications'

const BAR_MIN_WIDTH = 0.5 // 0.5% of the graph width
const LABEL_MIN_WIDTH = 60 // 60px

const TimelineGraphItem = memo(
  <T extends SpanType>({
    span,
    traceDuration,
    traceWidth,
    isSelected,
    isCollapsed,
    selectSpan,
  }: {
    span: AssembledSpan<T>
    traceDuration: number
    traceWidth: number
    isSelected: boolean
    isCollapsed: boolean
    selectedSpan?: AssembledSpan
    selectSpan: (span?: AssembledSpan) => void
  }) => {
    const specification = SPAN_SPECIFICATIONS[span.type]

    const barStyle = useMemo(() => {
      const startPercent = (span.startOffset / traceDuration) * 100
      const widthPercent = (span.duration / traceDuration) * 100

      return {
        left: `${startPercent}%`,
        width: `${Math.max(widthPercent, BAR_MIN_WIDTH)}%`,
      }
    }, [span.startOffset, span.duration, traceDuration])

    const labelStyle = useMemo(() => {
      const spanStartPercent = (span.startOffset / traceDuration) * 100
      const spanWidthPercent = (span.duration / traceDuration) * 100
      const renderedWidthPercent = Math.max(spanWidthPercent, BAR_MIN_WIDTH)
      const spanEndPercent = spanStartPercent + renderedWidthPercent
      const spanWidthPixels = (span.duration / traceDuration) * traceWidth
      const isLabelInside = spanEndPercent > 85
      const isSpanWideEnough = spanWidthPixels > LABEL_MIN_WIDTH

      // Position inside the span (right-aligned)
      if (isLabelInside && isSpanWideEnough) {
        return {
          left: `${spanEndPercent}%`,
          transform: 'translateX(-100%)',
          marginLeft: '-8px',
          isVisuallyInside: true,
        }
      }
      // Position outside to the left of span start (right-aligned)
      else if (isLabelInside && !isSpanWideEnough) {
        return {
          left: `${spanStartPercent}%`,
          transform: 'translateX(-100%)',
          marginLeft: '-8px',
          isVisuallyInside: false,
        }
      }
      // Position outside to the right of span end (left-aligned)
      return {
        left: `${spanEndPercent}%`,
        transform: 'translateX(8px)',
        marginLeft: '0px',
        isVisuallyInside: false,
      }
    }, [span.startOffset, span.duration, traceDuration, traceWidth])

    const colorScheme = useMemo(() => {
      if (isSelected) {
        return {
          background: 'bg-accent',
          border: 'border-accent-foreground',
        }
      }

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
    }, [isSelected, span.status, specification.color])

    return (
      <div className='relative w-full h-full'>
        <div
          className={cn(
            'absolute h-5 rounded-md cursor-pointer border top-1 hover:opacity-80',
            colorScheme.background,
            colorScheme.border +
              (isSelected || isCollapsed ? ' border-2' : '/10'),
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

export function TimelineGraph({
  trace,
  width,
  minWidth,
  selectedSpan,
  selectSpan,
  collapsedSpans,
}: {
  trace: AssembledTrace
  width: number
  minWidth: number
  selectedSpan?: AssembledSpan
  selectSpan: (span?: AssembledSpan) => void
  collapsedSpans: Set<string>
}) {
  const spans = useMemo(() => {
    const result: AssembledSpan[] = []

    const flatten = (span: AssembledSpan) => {
      result.push(span)
      if (!collapsedSpans.has(span.id)) {
        span.children.forEach(flatten)
      }
    }
    trace.children.forEach(flatten)

    return result
  }, [trace.children, collapsedSpans])

  if (spans.length === 0) {
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
              {spans.map((span) => (
                <div
                  key={`${span.conversationId}-${span.traceId}-${span.id}`}
                  className='h-7 flex items-center border-b border-border/50 last:border-b-0'
                >
                  <div className='relative w-full h-full px-2'>
                    <TimelineGraphItem
                      span={span}
                      traceDuration={trace.duration}
                      traceWidth={width}
                      isSelected={selectedSpan?.id === span.id}
                      isCollapsed={collapsedSpans.has(span.id)}
                      selectedSpan={selectedSpan}
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
