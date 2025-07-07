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

function IndentationLine({
  showCurve,
  isSelected,
  isParentSelected,
}: {
  showCurve: boolean
  isSelected: boolean
  isParentSelected: boolean
}) {
  const getLineColor = () => {
    if (isSelected) return 'white'
    if (isParentSelected) return 'primary'
    return 'border'
  }

  const lineColor = getLineColor()

  return (
    <div className='relative w-4 h-full flex justify-center'>
      {showCurve ? (
        <div className='relative -mt-1 -ml-3'>
          <div
            className={cn('border-l h-2.5', {
              'border-white': lineColor === 'white',
              'border-primary': lineColor === 'primary',
              'border-border': lineColor === 'border',
            })}
          />
          <div
            className={cn(
              'absolute top-2.5 border-l border-b h-2 w-2 rounded-bl-sm',
              {
                'border-white': lineColor === 'white',
                'border-primary': lineColor === 'primary',
                'border-border': lineColor === 'border',
              },
            )}
          />
        </div>
      ) : (
        <div
          className={cn('w-px h-7 -mt-1 -ml-3', {
            'bg-white': lineColor === 'white',
            'bg-primary': lineColor === 'primary',
            'bg-border': lineColor === 'border',
          })}
        />
      )}
    </div>
  )
}

function IndentationBar({
  depth,
  isLast,
  isSelected,
  isParentSelected,
  selectedSpanDepth,
  ancestorEndedLevels = new Set(),
}: {
  depth: number
  isLast: boolean
  isSelected: boolean
  isParentSelected: boolean
  selectedSpanDepth?: number
  ancestorEndedLevels?: Set<number>
}) {
  return (
    <div className='flex -mr-3'>
      {Array.from({ length: depth }).map((_, index) => {
        const currentLevel = index + 1
        const isCurrentLevel = currentLevel === depth
        const hasEndedAtThisLevel = ancestorEndedLevels.has(currentLevel)
        const showCurve = isCurrentLevel && isLast
        const shouldShowLine =
          !hasEndedAtThisLevel && (isCurrentLevel || currentLevel < depth)

        // Determine color for this specific level
        const isThisLevelSelected = isSelected && isCurrentLevel
        const isThisLevelFromSelectedSpan =
          selectedSpanDepth !== undefined &&
          currentLevel >= selectedSpanDepth &&
          isParentSelected

        return (
          <div key={index} className='h-7 w-4'>
            {shouldShowLine ? (
              <IndentationLine
                showCurve={showCurve}
                isSelected={isThisLevelSelected}
                isParentSelected={isThisLevelFromSelectedSpan}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function TimelineTreeItem<T extends SpanType>({
  span,
  isFirst: _isFirst,
  isLast,
  isSelected,
  isParentSelected,
  selectedSpanId,
  selectedSpanDepth,
  setSelectedSpan,
  ancestorEndedLevels = new Set(),
}: TimelineItemProps<T> & {
  selectedSpanId?: string
  selectedSpanDepth?: number
  setSelectedSpan: (span?: AssembledSpan) => void
  ancestorEndedLevels?: Set<number>
}) {
  const [expanded, setExpanded] = useState(true)
  const isExpanded = expanded || span.children.length < 1

  // Create new set of ended levels for children
  const newEndedLevels = new Set(ancestorEndedLevels)
  if (isLast) {
    newEndedLevels.add(span.depth)
  }

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
        <IndentationBar
          depth={span.depth}
          isLast={isLast}
          isSelected={isSelected}
          isParentSelected={isParentSelected}
          selectedSpanDepth={selectedSpanDepth}
          ancestorEndedLevels={ancestorEndedLevels}
        />
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
            isParentSelected={isParentSelected || selectedSpanId === span.id}
            selectedSpanId={selectedSpanId}
            selectedSpanDepth={selectedSpanDepth}
            setSelectedSpan={setSelectedSpan}
            ancestorEndedLevels={newEndedLevels}
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
          isParentSelected={selectedSpan?.id === span.parentId}
          selectedSpanId={selectedSpan?.id}
          selectedSpanDepth={selectedSpan?.depth}
          setSelectedSpan={setSelectedSpan}
        />
      ))}
    </div>
  )
}
