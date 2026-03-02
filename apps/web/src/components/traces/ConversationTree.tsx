import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { MouseEvent, memo, useCallback, useMemo } from 'react'
import { SPAN_COLORS } from '$/components/traces/spans/shared'
import { SPAN_SPECIFICATIONS } from '$/components/traces/spans/specifications'
import { IndentationBar } from '$/components/Sidebar/Files/IndentationBar'
import { IndentType } from '$/components/Sidebar/Files/NodeHeaderWrapper'
import {
  AssembledSpan,
  SpanStatus,
  SpanType,
} from '@latitude-data/core/constants'
import { TraceSection } from './ConversationTimeline'
import { getModifierKey } from '$/lib/browserUtils'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

const MODIFIER_KEY = getModifierKey()

const CollapseButton = memo(
  ({
    isCollapsed,
    onClick,
    variant,
  }: {
    isCollapsed: boolean
    onClick: (e: React.MouseEvent) => void
    variant: 'conversation' | 'trace'
  }) => {
    const itemType = variant === 'conversation' ? 'traces' : 'spans'
    const tooltipText = `${MODIFIER_KEY.symbol}+Click to ${isCollapsed ? 'expand' : 'collapse'} all ${itemType}`

    return (
      <Tooltip
        asChild
        trigger={
          <Button
            variant='ghost'
            size='none'
            className='opacity-0 group-hover/row:opacity-70 hover:!opacity-100 transition-opacity flex items-center gap-1 px-1'
            onClick={onClick}
            iconProps={{
              name: 'chevronsUpDown',
              size: 'small',
              color: 'foregroundMuted',
              placement: 'right',
            }}
          >
            <Text.H7 color='foregroundMuted' noWrap>
              {isCollapsed ? 'EXPAND' : 'COLLAPSE'}
            </Text.H7>
          </Button>
        }
      >
        {tooltipText}
      </Tooltip>
    )
  },
)

function getAllDescendantIds(span: AssembledSpan): string[] {
  const ids: string[] = []
  const collect = (s: AssembledSpan) => {
    if (s.children.length > 0) {
      ids.push(s.id)
      s.children.forEach(collect)
    }
  }
  span.children.forEach(collect)
  return ids
}

const TreeItem = memo(
  <T extends SpanType>({
    span,
    indentation,
    isSelected,
    selectedSpan,
    selectSpan,
    collapsedSpans,
    toggleCollapsed,
    setCollapsedSpans,
  }: {
    span: AssembledSpan<T>
    indentation: IndentType[]
    isSelected: boolean
    selectedSpan?: AssembledSpan
    selectSpan: (span?: AssembledSpan) => void
    collapsedSpans: Set<string>
    toggleCollapsed: (spanId: string) => void
    setCollapsedSpans: ReactStateDispatch<Set<string>>
  }) => {
    const specification = SPAN_SPECIFICATIONS[span.type]
    const isExpanded = !collapsedSpans.has(span.id)
    const hasChildren = span.children.length > 0

    const colorScheme = useMemo(() => {
      if (isSelected) {
        return { icon: 'accentForeground', text: 'accentForeground' }
      }
      if (span.status === SpanStatus.Error) {
        return { icon: SPAN_COLORS.red.text, text: SPAN_COLORS.red.text }
      }
      return { icon: specification.color.text, text: 'foreground' }
    }, [isSelected, span.status, specification.color])

    const descendantIds = useMemo(() => getAllDescendantIds(span), [span])
    const allDescendantsCollapsed = useMemo(
      () =>
        descendantIds.length > 0 &&
        descendantIds.every((id) => collapsedSpans.has(id)),
      [descendantIds, collapsedSpans],
    )

    const handleClick = useCallback(
      (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
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
      [span, isSelected, selectSpan, setCollapsedSpans, descendantIds],
    )

    const handleChevronClick = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation()
        if (span.children.length === 0) return

        if (e.metaKey || e.ctrlKey) {
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
          toggleCollapsed(span.id)
        }
      },
      [span, toggleCollapsed, setCollapsedSpans, descendantIds],
    )

    const handleCollapseButtonClick = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation()
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
      },
      [descendantIds, setCollapsedSpans],
    )

    return (
      <div className='w-full h-full flex flex-col items-start justify-center'>
        <div
          className={cn(
            'group/row w-full h-7 flex items-center justify-between py-1 px-2 rounded-md cursor-pointer',
            {
              'bg-transparent hover:bg-secondary text-foreground': !isSelected,
              'bg-accent hover:bg-accent/80 text-accent-foreground': isSelected,
            },
          )}
          onClick={handleClick}
        >
          <div className='flex items-center gap-2'>
            <IndentationBar
              indentation={indentation}
              hasChildren={isExpanded && hasChildren}
              startOnIndex={0}
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
                onClick={handleChevronClick}
              />
            ) : null}
            <div className='w-3 flex items-center justify-center'>
              <Icon
                name={specification.icon}
                size='small'
                color={colorScheme.icon as TextColor}
                className='flex-shrink-0 ml-1'
              />
            </div>
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
          {descendantIds.length > 0 && (
            <CollapseButton
              isCollapsed={allDescendantsCollapsed}
              onClick={handleCollapseButtonClick}
              variant='trace'
            />
          )}
        </div>
        {isExpanded &&
          span.children.map((child, index) => {
            const isLastItem = index === span.children.length - 1
            const childIndentation = [...indentation, { isLast: isLastItem }]
            return (
              <TreeItem
                key={`${child.traceId}-${child.id}`}
                span={child}
                indentation={childIndentation}
                isSelected={selectedSpan?.id === child.id}
                selectedSpan={selectedSpan}
                selectSpan={selectSpan}
                collapsedSpans={collapsedSpans}
                toggleCollapsed={toggleCollapsed}
                setCollapsedSpans={setCollapsedSpans}
              />
            )
          })}
      </div>
    )
  },
)

const ConversationItem = memo(
  ({
    isSelected,
    onClick,
    isCollapsed,
    toggleCollapseAll,
  }: {
    isSelected: boolean
    onClick: () => void
    isCollapsed: boolean
    toggleCollapseAll: () => void
  }) => {
    const handleClick = useCallback(
      (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
          toggleCollapseAll()
        } else {
          onClick()
        }
      },
      [onClick, toggleCollapseAll],
    )

    const handleChevronClick = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation()
        toggleCollapseAll()
      },
      [toggleCollapseAll],
    )

    const handleButtonClick = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation()
        toggleCollapseAll()
      },
      [toggleCollapseAll],
    )

    return (
      <div
        className={cn(
          'group/row w-full h-7 flex items-center justify-between py-1 px-2 rounded-md cursor-pointer mb-1',
          {
            'bg-transparent hover:bg-secondary text-foreground': !isSelected,
            'bg-accent hover:bg-accent/80 text-accent-foreground': isSelected,
          },
        )}
        onClick={handleClick}
      >
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='none'
            iconProps={{
              name: isCollapsed ? 'chevronRight' : 'chevronDown',
              color: isSelected ? 'accentForeground' : 'foregroundMuted',
              className: 'flex-shrink-0',
            }}
            className='w-4 h-7'
            onClick={handleChevronClick}
          />
          <Icon
            name='messagesSquare'
            size='small'
            color={isSelected ? 'accentForeground' : 'foregroundMuted'}
            className='flex-shrink-0'
          />
          <Text.H6
            color={isSelected ? 'accentForeground' : 'foreground'}
            weight='semibold'
            userSelect={false}
            noWrap
            ellipsis
          >
            Conversation
          </Text.H6>
        </div>
        <CollapseButton
          isCollapsed={isCollapsed}
          onClick={handleButtonClick}
          variant='conversation'
        />
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
  isConversationSelected,
  onSelectConversation,
  isConversationCollapsed,
  toggleCollapseAll,
  setCollapsedSpans,
}: {
  sections: TraceSection[]
  minWidth: number
  selectedSpan?: AssembledSpan
  selectSpan: (span?: AssembledSpan) => void
  collapsedSpans: Set<string>
  toggleCollapsed: (spanId: string) => void
  isConversationSelected: boolean
  onSelectConversation: () => void
  isConversationCollapsed: boolean
  toggleCollapseAll: () => void
  setCollapsedSpans: ReactStateDispatch<Set<string>>
}) {
  const showConversationItem = sections.length > 1

  return (
    <div className='flex-1 flex-col items-center justify-center p-2 pb-0'>
      {showConversationItem && (
        <ConversationItem
          isSelected={isConversationSelected}
          onClick={onSelectConversation}
          isCollapsed={isConversationCollapsed}
          toggleCollapseAll={toggleCollapseAll}
        />
      )}
      <div>
        {sections.map((section, sectionIndex) => {
          const isLastSection = sectionIndex === sections.length - 1
          const baseIndentation: IndentType[] = showConversationItem
            ? [{ isLast: isLastSection }]
            : []

          return (
            <div key={section.trace.id}>
              {section.trace.children.map((span) => (
                <TreeItem
                  key={`${span.traceId}-${span.id}`}
                  span={span}
                  indentation={baseIndentation}
                  isSelected={selectedSpan?.id === span.id}
                  selectedSpan={selectedSpan}
                  selectSpan={selectSpan}
                  collapsedSpans={collapsedSpans}
                  toggleCollapsed={toggleCollapsed}
                  setCollapsedSpans={setCollapsedSpans}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
