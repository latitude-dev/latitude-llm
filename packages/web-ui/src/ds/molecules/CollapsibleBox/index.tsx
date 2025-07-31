'use client'
import { MouseEvent, ReactNode, useCallback, useState } from 'react'
import { cn } from '../../../lib/utils'
import { Icon, IconName } from '../../atoms/Icons'
import { Text } from '../../atoms/Text'

export const COLLAPSED_BOX_HEIGHT = 48

export type OnToggleFn = (expanded: boolean) => void
export function CollapsibleBox({
  title,
  icon,
  collapsedContent,
  collapsedContentHeader,
  expandedContent,
  expandedContentHeader,
  expandedHeight,
  initialExpanded = false,
  onToggle,
  scrollable = true,
  headerDivider = false,
  paddingBottom = true,
  paddingRight = true,
  paddingLeft = true,
  isExpanded: isExpandedProp,
  avoidToggleOnTitleClick = false,
  handleIcon = true,
  handlePosition = 'right',
  className,
  headerClassName,
}: {
  title: string | ReactNode
  icon?: IconName
  collapsedContent?: ReactNode
  collapsedContentHeader?: ReactNode
  expandedContent?: ReactNode
  expandedContentHeader?: ReactNode
  expandedHeight?: number
  initialExpanded?: boolean
  onToggle?: OnToggleFn
  isExpanded?: boolean
  scrollable?: boolean
  headerDivider?: boolean
  paddingBottom?: boolean
  paddingRight?: boolean
  paddingLeft?: boolean
  avoidToggleOnTitleClick?: boolean
  handleIcon?: boolean
  handlePosition?: 'left' | 'right'
  className?: string
  headerClassName?: string
}) {
  const [internalExpanded, setInternalExpanded] = useState(initialExpanded)
  const isControlled = isExpandedProp !== undefined
  const isExpanded = isControlled ? isExpandedProp : internalExpanded
  const handleToggle = useCallback(() => {
    const next = !isExpanded

    if (isControlled) {
      onToggle?.(next)
    } else {
      setInternalExpanded(next)
    }
  }, [isControlled, isExpanded, onToggle])
  const onTitleClick = useCallback(
    (e: MouseEvent) => {
      if (!avoidToggleOnTitleClick) return

      e.stopPropagation()
    },
    [avoidToggleOnTitleClick],
  )

  return (
    <div
      className={cn(
        className,
        'w-full border rounded-lg relative overflow-hidden',
        {
          'h-auto': !isExpanded,
          'custom-scrollbar': scrollable,
          'flex flex-col': !scrollable,
        },
      )}
      style={{ minHeight: COLLAPSED_BOX_HEIGHT }}
    >
      <div
        className={cn(
          headerClassName,
          'flex flex-col cursor-pointer sticky top-0 z-10 bg-background',
        )}
        onClick={handleToggle}
      >
        <div
          className={cn(
            'flex flex-shrink-0 justify-between items-center py-3.5 px-4 gap-x-4',
            {
              'border-b': isExpanded && headerDivider,
            },
          )}
        >
          <div
            className='flex flex-row items-center gap-x-2'
            onClick={onTitleClick}
          >
            {handlePosition === 'left' && handleIcon && (
              <Icon
                className='flex-shrink-0'
                name={isExpanded ? 'chevronUp' : 'chevronDown'}
              />
            )}
            {icon && <Icon className='flex-shrink-0' name={icon} />}
            {typeof title === 'string' ? (
              <Text.H5M userSelect={false}>{title}</Text.H5M>
            ) : (
              title
            )}
          </div>
          <div className='flex flex-row flex-grow min-w-0 items-center gap-x-2'>
            <div className='flex-grow min-w-0'>
              {isExpanded ? expandedContentHeader : collapsedContentHeader}
            </div>
            {handlePosition === 'right' && handleIcon && (
              <Icon
                className='flex-shrink-0'
                name={isExpanded ? 'chevronUp' : 'chevronDown'}
              />
            )}
          </div>
        </div>
        {!isExpanded && collapsedContent && (
          <div className='px-4 pb-4'>{collapsedContent}</div>
        )}
      </div>
      <div
        className={cn('transition-all duration-300 ease-in-out', {
          'flex flex-col min-h-0': !scrollable,
          'overflow-y-auto custom-scrollbar scrollable-indicator': scrollable,
        })}
        style={{
          height: isExpanded ? expandedHeight : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div
          className={cn({
            'flex min-h-0': !scrollable,
            'pl-4': paddingLeft,
            'pr-4': paddingRight,
            'pb-3.5': paddingBottom,
          })}
        >
          {expandedContent}
        </div>
      </div>
    </div>
  )
}
