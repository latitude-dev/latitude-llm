import { formatDuration } from '$/app/_lib/formatUtils'
import { AssembledSpan, AssembledTrace } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { colors } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { useMemo } from 'react'
import { SPAN_SPECIFICATIONS } from '../../spans/specifications'

// Helper function to get all spans in hierarchical order (same as tree)
function getAllSpansInOrder(spans: AssembledSpan[]): AssembledSpan[] {
  const result: AssembledSpan[] = []

  const addSpanAndChildren = (span: AssembledSpan) => {
    result.push(span)
    span.children.forEach(addSpanAndChildren)
  }

  spans.forEach(addSpanAndChildren)
  return result
}

// Timeline scale component
function TimelineScale({
  duration,
  width,
}: {
  duration: number
  width: number
}) {
  const tickMarks = useMemo(() => {
    const marks = []
    const tickCount = Math.min(10, Math.max(5, Math.floor(width / 100)))

    for (let i = 0; i <= tickCount; i++) {
      const position = (i / tickCount) * width
      const timeValue = (i / tickCount) * duration
      marks.push({
        position,
        time: timeValue,
        label: formatDuration(timeValue),
      })
    }

    return marks
  }, [duration, width])

  return (
    <div
      className='relative h-8 border-b border-border bg-background'
      style={{ paddingLeft: '0.5rem' }}
    >
      {tickMarks.map((mark, index) => (
        <div
          key={index}
          className='absolute top-0 h-full flex flex-col items-center'
          style={{ left: mark.position }}
        >
          <div className='w-px h-2 bg-border' />
          <Text.H6 color='foregroundMuted' userSelect={false}>
            {mark.label}
          </Text.H6>
        </div>
      ))}
    </div>
  )
}

// Individual span bar component
function SpanBar({
  span,
  traceDuration,
  isSelected,
  onClick,
}: {
  span: AssembledSpan
  traceDuration: number
  isSelected: boolean
  onClick: () => void
}) {
  const specification = SPAN_SPECIFICATIONS[span.type]

  const barStyle = useMemo(() => {
    const startPercent = (span.startOffset / traceDuration) * 100
    const widthPercent = (span.duration / traceDuration) * 100

    return {
      left: `${startPercent}%`,
      width: `${Math.max(widthPercent, 0.5)}%`, // Minimum width for visibility (4px on 800px container)
    }
  }, [span.startOffset, span.duration, traceDuration])

  return (
    <div className='relative w-full h-full'>
      {/* Span bar - no text inside */}
      <div
        className={cn(
          'absolute h-5 rounded-md cursor-pointer border top-1',
          {
            'bg-primary hover:bg-primary/80 border-primary-foreground':
              isSelected,
          },
          !isSelected && colors.backgrounds[specification.color.background],
          !isSelected && colors.borderColors[specification.color.border],
        )}
        style={barStyle}
        onClick={onClick}
      />

      {/* Duration label on the right - outside the rectangle */}
      <div
        className='absolute flex items-center ml-2 top-1 h-5'
        style={{
          left: `${((span.startOffset + span.duration) / traceDuration) * 100}%`,
        }}
      >
        <Text.H6 color='foregroundMuted' userSelect={false}>
          {formatDuration(span.duration)}
        </Text.H6>
      </div>
    </div>
  )
}

// Main timeline graph component
export function TimelineGraph({
  trace,
  selectedSpan,
  setSelectedSpan,
}: {
  trace: AssembledTrace
  selectedSpan?: AssembledSpan
  setSelectedSpan: (span?: AssembledSpan) => void
}) {
  const allSpans = useMemo(
    () => getAllSpansInOrder(trace.children),
    [trace.children],
  )

  const containerWidth = 800 // This will be the timeline width

  if (allSpans.length === 0) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4'>
        <Text.H5 color='foregroundMuted'>No events found so far</Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full h-full flex flex-col'>
      {/* Spans area - no internal scrolling */}
      <div className='flex-1 pt-2'>
        <div className='relative' style={{ width: containerWidth }}>
          {allSpans.map((span, _index) => (
            <div
              key={`${span.conversationId}-${span.traceId}-${span.id}`}
              className='h-7 flex items-center border-b border-border/50 last:border-b-0'
            >
              <div
                className='relative w-full h-full'
                style={{ paddingLeft: '0.5rem' }}
              >
                <SpanBar
                  span={span}
                  traceDuration={trace.duration}
                  isSelected={selectedSpan?.id === span.id}
                  onClick={() => {
                    if (selectedSpan?.id === span.id) {
                      setSelectedSpan(undefined)
                    } else {
                      setSelectedSpan(span)
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline scale - sticky at bottom */}
      <div className='sticky bottom-0 z-10 bg-background border-t border-border'>
        <TimelineScale duration={trace.duration} width={containerWidth} />
      </div>
    </div>
  )
}
