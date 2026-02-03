import { memo, useCallback, useMemo } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
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

const BAR_MIN_WIDTH = 0.5
const LABEL_MIN_WIDTH = 60

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
    traceWidth,
    isSelected,
    isCollapsed,
    selectSpan,
    toggleCollapsed,
    setCollapsedSpans,
  }: {
    span: AssembledSpan<T>
    cumulativeOffset: number
    totalDuration: number
    traceWidth: number
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
          className='absolute flex items-center top-1 h-5 pointer-events-none'
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
    onClick,
    onToggleCollapse,
  }: {
    isSelected: boolean
    isCollapsed: boolean
    onClick: () => void
    onToggleCollapse: () => void
  }) => {
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
          onToggleCollapse()
        } else {
          onClick()
        }
      },
      [onClick, onToggleCollapse],
    )

    const handleButtonClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onToggleCollapse()
      },
      [onToggleCollapse],
    )

    return (
      <div className='h-7 flex items-center mb-1'>
        <div className='relative w-full h-full px-2'>
          <div
            className={cn(
              'absolute h-5 rounded-md cursor-pointer border top-1 hover:opacity-80 transition-opacity bg-muted left-2 right-2 flex items-center justify-end pr-1',
              {
                'border-2 border-primary': isSelected,
                'border-dashed border-2 border-border': isCollapsed,
                'border-border/10': !isSelected && !isCollapsed,
              },
            )}
            onClick={handleClick}
          >
            <Tooltip
              trigger={
                <Button
                  variant='ghost'
                  size='none'
                  className='h-4 w-4 opacity-50 hover:opacity-100'
                  iconProps={{
                    name: 'chevronsUpDown',
                    size: 'small',
                    color: 'foregroundMuted',
                  }}
                  onClick={handleButtonClick}
                />
              }
            >
              {isCollapsed ? 'Expand all' : 'Collapse all'}
            </Tooltip>
          </div>
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
  toggleCollapsed,
  setCollapsedSpans,
  showConversationSpacer,
  isConversationCollapsed,
  isConversationSelected,
  onSelectConversation,
  toggleCollapseAll,
}: {
  sections: TraceSection[]
  totalDuration: number
  width: number
  minWidth: number
  selectedSpan?: AssembledSpan
  selectSpan: (span?: AssembledSpan) => void
  collapsedSpans: Set<string>
  toggleCollapsed: (spanId: string) => void
  setCollapsedSpans: ReactStateDispatch<Set<string>>
  showConversationSpacer: boolean
  isConversationCollapsed: boolean
  isConversationSelected: boolean
  onSelectConversation: () => void
  toggleCollapseAll: () => void
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
    <div className='w-full h-full flex flex-col pt-2'>
      <div className='w-full h-full overflow-x-auto'>
        <div
          className='flex flex-col h-full'
          style={{ minWidth: `${minWidth}px` }}
        >
          <div className='flex-1'>
            {showConversationSpacer && (
              <ConversationGraphItem
                isSelected={isConversationSelected}
                isCollapsed={isConversationCollapsed}
                onClick={onSelectConversation}
                onToggleCollapse={toggleCollapseAll}
              />
            )}
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
                      toggleCollapsed={toggleCollapsed}
                      setCollapsedSpans={setCollapsedSpans}
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
