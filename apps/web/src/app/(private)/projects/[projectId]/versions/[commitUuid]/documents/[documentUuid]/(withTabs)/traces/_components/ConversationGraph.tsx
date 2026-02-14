import { memo, useCallback, useMemo } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { colors } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { SPAN_COLORS } from '$/components/tracing/spans/shared'
import { SPAN_SPECIFICATIONS } from '$/components/tracing/spans/specifications'
import {
  AssembledSpan,
  SpanStatus,
  SpanType,
} from '@latitude-data/core/constants'
import { TraceSection } from './ConversationTimeline'
import { TickMark } from '$/components/tracing/traces/TimelineScale/useTickMarks'

const BAR_MIN_WIDTH = 0.5

function getAllDescendantIds(span: AssembledSpan): string[] {
  const ids: string[] = []
  const collect = (s: AssembledSpan) => {
    if (s.children.length > 0) {
      ids.push(s.id)
      s.children.forEach(collect)
    }
  }
  collect(span)
  return ids
}

const GraphItem = memo(
  <T extends SpanType>({
    span,
    cumulativeOffset,
    totalDuration,
    isSelected,
    isCollapsed,
    selectSpan,
    toggleCollapsed,
    setCollapsedSpans,
  }: {
    span: AssembledSpan<T>
    cumulativeOffset: number
    totalDuration: number
    isSelected: boolean
    isCollapsed: boolean
    selectSpan: (span?: AssembledSpan) => void
    toggleCollapsed: (spanId: string) => void
    setCollapsedSpans: ReactStateDispatch<Set<string>>
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
      const isLabelInside = spanEndPercent > 90

      if (isLabelInside) {
        return {
          left: `${spanEndPercent}%`,
          transform: 'translateX(calc(-100% - 8px))',
          isVisuallyInside: true,
        }
      }
      return {
        left: `${spanEndPercent}%`,
        transform: 'translateX(8px)',
        isVisuallyInside: false,
      }
    }, [span.startOffset, span.duration, cumulativeOffset, totalDuration])

    const colorScheme = useMemo(() => {
      if (span.status === SpanStatus.Error) {
        return {
          background: colors.backgrounds[SPAN_COLORS.red.background],
          border: colors.borderColors[SPAN_COLORS.red.border],
          text: SPAN_COLORS.red.text,
        }
      }

      return {
        background: colors.backgrounds[specification.color.background],
        border: colors.borderColors[specification.color.border],
        text: specification.color.text,
      }
    }, [span.status, specification.color])

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
          const descendantIds = getAllDescendantIds(span)
          if (descendantIds.length === 0) return

          setCollapsedSpans((prev) => {
            const allCollapsed = descendantIds.every((id) => prev.has(id))
            const newSet = new Set(prev)
            if (allCollapsed) {
              descendantIds.forEach((id) => newSet.delete(id))
            } else {
              descendantIds.forEach((id) => newSet.add(id))
            }
            return newSet
          })
        } else {
          if (!isSelected) selectSpan(span)
        }
      },
      [span, isSelected, selectSpan, setCollapsedSpans],
    )

    return (
      <div className='relative w-full h-full'>
        <div
          className={cn(
            'absolute h-5 rounded-md cursor-pointer border top-1 hover:opacity-80 transition-opacity',
            colorScheme.background,
            {
              'border-2': isSelected || isCollapsed,
              'border-dashed': isCollapsed && span.children.length > 0,
              [colorScheme.border]: isSelected,
              [`${colorScheme.border}/10`]: !isSelected,
            },
          )}
          style={barStyle}
          onClick={handleClick}
          onDoubleClick={() => toggleCollapsed(span.id)}
        />
        <div
          className='absolute flex items-center top-1 h-5 pointer-events-none z-20'
          style={labelStyle}
        >
          <Text.H6
            color={
              isSelected && labelStyle.isVisuallyInside
                ? colorScheme.text
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

const ConversationGraphItem = memo(
  ({
    isSelected,
    isCollapsed,
  }: {
    isSelected: boolean
    isCollapsed: boolean
  }) => {
    return (
      <div className='h-7 flex items-center mb-1 px-2'>
        <div
          className={cn(
            'w-full h-5 rounded-md cursor-pointer border top-1 hover:opacity-80 transition-opacity bg-muted flex items-center justify-end',
            {
              'border-2 border-muted-foreground': isSelected,
              'border-dashed border-2 border-border': isCollapsed,
              'border-border/10': !isSelected && !isCollapsed,
            },
          )}
        />
      </div>
    )
  },
)

export function ConversationGraph({
  sections,
  totalDuration,
  minWidth,
  selectedSpan,
  selectSpan,
  collapsedSpans,
  toggleCollapsed,
  setCollapsedSpans,
  showConversationSpacer,
  isConversationCollapsed,
  isConversationSelected,
  tickMarks,
}: {
  sections: TraceSection[]
  totalDuration: number
  minWidth: number
  selectedSpan?: AssembledSpan
  selectSpan: (span?: AssembledSpan) => void
  collapsedSpans: Set<string>
  toggleCollapsed: (spanId: string) => void
  setCollapsedSpans: ReactStateDispatch<Set<string>>
  showConversationSpacer: boolean
  isConversationCollapsed: boolean
  isConversationSelected: boolean
  tickMarks: TickMark[]
}) {
  const flattenedSpans = useMemo(() => {
    const result: {
      span: AssembledSpan
      cumulativeOffset: number
    }[] = []

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
    <div
      style={{ minWidth }}
      className='w-full h-full pt-2 group/timeline relative'
    >
      {showConversationSpacer && (
        <ConversationGraphItem
          isSelected={isConversationSelected}
          isCollapsed={isConversationCollapsed}
        />
      )}
      {flattenedSpans.map((item) => (
        <div
          key={`${item.span.traceId}-${item.span.id}`}
          className='relative z-20 h-7 flex items-center px-2 border-b border-border/50 last:border-b-0'
        >
          <div className='relative w-full h-full'>
            <GraphItem
              span={item.span}
              cumulativeOffset={item.cumulativeOffset}
              totalDuration={totalDuration}
              isSelected={selectedSpan?.id === item.span.id}
              isCollapsed={collapsedSpans.has(item.span.id)}
              selectSpan={selectSpan}
              toggleCollapsed={toggleCollapsed}
              setCollapsedSpans={setCollapsedSpans}
            />
          </div>
        </div>
      ))}
      {tickMarks.map((mark, index) => (
        <div
          key={index}
          className='absolute top-0 bottom-0 w-px bg-border/50 opacity-0 group-hover/timeline:opacity-100 transition-opacity pointer-events-none z-10 -translate-x-1/2'
          style={{ left: `${mark.position}%` }}
        />
      ))}
    </div>
  )
}
