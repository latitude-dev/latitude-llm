'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { memo, useCallback, useMemo } from 'react'
import { SPAN_COLORS } from '$/components/tracing/spans/shared'
import { SPAN_SPECIFICATIONS } from '$/components/tracing/spans/specifications'
import {
  AssembledSpan,
  SpanStatus,
  SpanType,
} from '@latitude-data/core/constants'
import { TraceSection } from './ConversationTimeline'

const IndentationLine = memo(
  ({
    showCurve,
    isSelected,
    isParentSelected,
  }: {
    showCurve: boolean
    isSelected: boolean
    isParentSelected: boolean
  }) => {
    const [borderColor, backgroundColor] = useMemo(() => {
      if (isSelected) {
        return ['border-border', 'bg-border']
      }
      if (isParentSelected) {
        return ['border-accent-foreground', 'bg-accent-foreground']
      }
      return ['border-border', 'bg-border']
    }, [isSelected, isParentSelected])

    return (
      <div className='relative w-4 h-full flex justify-center'>
        {showCurve ? (
          <div className='relative -mt-1 -ml-3'>
            <div className={cn('border-l h-2.5', borderColor)} />
            <div
              className={cn(
                'absolute top-2.5 border-l border-b h-2 w-2 rounded-bl-sm',
                borderColor,
              )}
            />
          </div>
        ) : (
          <div className={cn('w-px h-7 -mt-1 -ml-3', backgroundColor)} />
        )}
      </div>
    )
  },
)

const IndentationBar = memo(
  ({
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
  }) => {
    return (
      <div className='flex -mr-3'>
        {Array.from({ length: depth }).map((_, index) => {
          const currentLevel = index + 1
          const isCurrentLevel = currentLevel === depth
          const hasEndedAtThisLevel = ancestorEndedLevels.has(currentLevel)
          const showCurve = isCurrentLevel && isLast
          const shouldShowLine =
            !hasEndedAtThisLevel && (isCurrentLevel || currentLevel < depth)

          const isThisLevelSelected = isSelected && isCurrentLevel
          const isThisLevelFromSelectedSpan =
            selectedSpanDepth !== undefined &&
            currentLevel > selectedSpanDepth &&
            isParentSelected

          return (
            <div key={index} className='h-7 w-4'>
              {shouldShowLine && (
                <IndentationLine
                  showCurve={showCurve}
                  isSelected={isThisLevelSelected}
                  isParentSelected={isThisLevelFromSelectedSpan}
                />
              )}
            </div>
          )
        })}
      </div>
    )
  },
)

const TreeItem = memo(
  <T extends SpanType>({
    span,
    ancestorEndedLevels = new Set(),
    isLast,
    isSelected,
    isParentSelected,
    selectedSpan,
    selectSpan,
    collapsedSpans,
    toggleCollapsed,
  }: {
    span: AssembledSpan<T>
    ancestorEndedLevels?: Set<number>
    isFirst: boolean
    isLast: boolean
    isSelected: boolean
    isParentSelected: boolean
    selectedSpan?: AssembledSpan
    selectSpan: (span?: AssembledSpan) => void
    collapsedSpans: Set<string>
    toggleCollapsed: (spanId: string) => void
  }) => {
    const specification = SPAN_SPECIFICATIONS[span.type]
    const isExpanded = !collapsedSpans.has(span.id)
    const currentEndedLevels = useMemo(() => {
      if (!isLast) return ancestorEndedLevels
      const newSet = new Set(ancestorEndedLevels)
      newSet.add(span.depth)
      return newSet
    }, [ancestorEndedLevels, isLast, span.depth])

    const colorScheme = useMemo(() => {
      if (isSelected) {
        return { icon: 'accentForeground', text: 'accentForeground' }
      }
      if (span.status === SpanStatus.Error) {
        return { icon: SPAN_COLORS.red.text, text: SPAN_COLORS.red.text }
      }
      return { icon: specification.color.text, text: 'foreground' }
    }, [isSelected, span.status, specification.color])

    const handleClick = useCallback(() => {
      if (isSelected) selectSpan(undefined)
      else selectSpan(span)
    }, [isSelected, selectSpan, span])

    return (
      <div className='w-full h-full flex flex-col items-start justify-center'>
        <div
          className={cn(
            'w-full h-7 flex items-center justify-start gap-2 py-1 px-2 rounded-md cursor-pointer',
            {
              'bg-transparent hover:bg-secondary text-foreground': !isSelected,
              'bg-accent hover:bg-accent/80 text-accent-foreground': isSelected,
            },
          )}
          onClick={handleClick}
        >
          <IndentationBar
            depth={span.depth}
            isLast={isLast}
            isSelected={isSelected}
            isParentSelected={isParentSelected}
            selectedSpanDepth={selectedSpan?.depth}
            ancestorEndedLevels={ancestorEndedLevels}
          />
          {span.children.length > 0 ? (
            <Button
              variant='ghost'
              size='none'
              iconProps={{
                name: isExpanded ? 'chevronDown' : 'chevronRight',
                color: isSelected ? 'accentForeground' : 'foregroundMuted',
                className: 'flex-shrink-0',
              }}
              className='w-4 h-7'
              onClick={(e) => {
                e.stopPropagation()
                if (span.children.length > 0) toggleCollapsed(span.id)
              }}
            />
          ) : (
            <div className='-ml-1.5' />
          )}
          <Icon
            name={specification.icon}
            size='small'
            color={colorScheme.icon as TextColor}
            className='flex-shrink-0'
          />
          <Text.H6
            color={colorScheme.text as TextColor}
            weight={isSelected || !isExpanded ? 'semibold' : 'normal'}
            userSelect={false}
            noWrap
            ellipsis
          >
            {span.name}
          </Text.H6>
        </div>
        {isExpanded &&
          span.children.map((child, index) => (
            <TreeItem
              key={`${child.traceId}-${child.id}`}
              span={child}
              isFirst={index === 0}
              isLast={index === span.children.length - 1}
              isSelected={selectedSpan?.id === child.id}
              isParentSelected={
                isParentSelected || selectedSpan?.id === span.id
              }
              selectedSpan={selectedSpan}
              selectSpan={selectSpan}
              collapsedSpans={collapsedSpans}
              toggleCollapsed={toggleCollapsed}
              ancestorEndedLevels={currentEndedLevels}
            />
          ))}
      </div>
    )
  },
)

export function ConversationTree({
  sections,
  selectedSpan,
  selectSpan,
  collapsedSpans,
  toggleCollapsed,
}: {
  sections: TraceSection[]
  width: number
  minWidth: number
  selectedSpan?: AssembledSpan
  selectSpan: (span?: AssembledSpan) => void
  collapsedSpans: Set<string>
  toggleCollapsed: (spanId: string) => void
}) {
  return (
    <div className='flex-1 flex-col items-center justify-center p-2 pb-0'>
      {sections.map((section) => (
        <div key={section.trace.id}>
          {section.trace.children.map((span, index) => (
            <TreeItem
              key={`${span.traceId}-${span.id}`}
              span={span}
              isFirst={index === 0}
              isLast={index === section.trace.children.length - 1}
              isSelected={selectedSpan?.id === span.id}
              isParentSelected={selectedSpan?.id === span.parentId}
              selectedSpan={selectedSpan}
              selectSpan={selectSpan}
              collapsedSpans={collapsedSpans}
              toggleCollapsed={toggleCollapsed}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
