import {
  AssembledSpan,
  AssembledTrace,
  SpanType,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useState } from 'react'
import { SPAN_SPECIFICATIONS, TimelineItemProps } from '../../spans'

// Component for rendering tree connection lines
function TreeConnector({
  isLast,
  depth,
}: {
  depth: number
  isFirst: boolean
  isLast: boolean
}) {
  if (depth === 0) return null

  return (
    <div className='flex'>
      {/* Render vertical lines for parent levels */}
      {Array.from({ length: depth - 1 }).map((_, index) => (
        <div key={index} className='w-6 flex justify-center'>
          <div className='w-px bg-border h-full' />
        </div>
      ))}

      {/* Render the connector for current level */}
      <div className='w-6 flex justify-center relative'>
        <div className='w-px bg-border h-2' />
        <div
          className={cn(
            'absolute top-2 left-1/2 w-3 h-px bg-border',
            '-translate-x-1/2',
          )}
        />
        {!isLast && (
          <div className='w-px bg-border h-full absolute top-2 left-1/2 -translate-x-1/2' />
        )}
      </div>
    </div>
  )
}

function TimelineTreeItem<T extends SpanType>({
  span,
  isFirst,
  isLast,
  isSelected,
  selectedSpanId,
  setSelectedSpan,
}: TimelineItemProps<T> & {
  selectedSpanId?: string
  setSelectedSpan: (span?: AssembledSpan) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isExpanded = expanded || span.children.length < 1

  const specification = SPAN_SPECIFICATIONS[span.type]
  if (!specification) return null

  return (
    <div className='w-full h-full flex flex-col items-start justify-center'>
      <div
        className={cn(
          'w-full h-7 flex items-center justify-start gap-2 py-1 px-2 rounded-md cursor-pointer',
          {
            'bg-background hover:bg-secondary text-foreground': !isSelected,
            'bg-primary hover:bg-primary/80 text-primary-foreground':
              isSelected,
          },
        )}
        onClick={() => {
          if (isSelected) setSelectedSpan(undefined)
          else setSelectedSpan(span)
        }}
      >
        <TreeConnector isFirst={isFirst} isLast={isLast} depth={span.depth} />
        <Button
          variant='ghost'
          size='none'
          iconProps={{
            name: isExpanded ? 'chevronDown' : 'chevronRight',
            color: isSelected ? 'primaryForeground' : 'foregroundMuted',
            className: 'flex-shrink-0',
          }}
          className='w-4 h-7'
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
        />
        <Icon
          name={specification.icon}
          size='small'
          color={isSelected ? 'primaryForeground' : specification.color}
          className='flex-shrink-0'
        />
        <Text.H6
          color={isSelected ? 'primaryForeground' : 'foreground'}
          weight={isSelected || !isExpanded ? 'semibold' : 'normal'}
          isItalic={!isExpanded}
          userSelect={false}
          noWrap
          ellipsis
        >
          {span.name}
        </Text.H6>
      </div>
      {isExpanded &&
        span.children.map((child, index) => (
          <TimelineTreeItem
            key={`${child.conversationId}-${child.traceId}-${child.id}`}
            span={child}
            isFirst={index === 0}
            isLast={index === span.children.length - 1}
            isSelected={selectedSpanId === child.id}
            selectedSpanId={selectedSpanId}
            setSelectedSpan={setSelectedSpan}
          />
        ))}
    </div>
  )
}

export function TimelineTree({
  trace,
  selectedSpan,
  setSelectedSpan,
}: {
  trace: AssembledTrace
  selectedSpan?: AssembledSpan
  setSelectedSpan: (span?: AssembledSpan) => void
}) {
  return (
    <div className='flex-1 flex-col items-center justify-center p-2'>
      {trace.children.map((span, index) => (
        <TimelineTreeItem
          key={`${span.conversationId}-${span.traceId}-${span.id}`}
          span={span}
          isFirst={index === 0}
          isLast={index === trace.children.length - 1}
          isSelected={selectedSpan?.id === span.id}
          selectedSpanId={selectedSpan?.id}
          setSelectedSpan={setSelectedSpan}
        />
      ))}
    </div>
  )
}
