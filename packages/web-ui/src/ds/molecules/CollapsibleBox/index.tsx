'use client'
import { ReactNode, useCallback, useState } from 'react'
import { Icon, IconName } from '../../atoms/Icons'
import { Text } from '../../atoms/Text'
import { cn } from '../../../lib/utils'

export const COLLAPSED_BOX_HEIGHT = 56

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
  paddingBottom = true,
  paddingRight = true,
  isExpanded: isExpandedProp,
}: {
  title: string
  icon?: IconName
  collapsedContent?: ReactNode
  collapsedContentHeader?: ReactNode
  expandedContent?: ReactNode
  expandedContentHeader?: ReactNode
  expandedHeight?: string
  initialExpanded?: boolean
  onToggle?: OnToggleFn
  isExpanded?: boolean
  scrollable?: boolean
  paddingBottom?: boolean
  paddingRight?: boolean
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

  return (
    <div
      className={cn('w-full border rounded-lg relative overflow-hidden', {
        'h-auto': !isExpanded,
        'custom-scrollbar': scrollable,
        'flex flex-col': !scrollable,
      })}
      style={{ minHeight: COLLAPSED_BOX_HEIGHT }}
    >
      <div
        className='flex flex-col cursor-pointer sticky top-0 z-10 bg-background'
        onClick={handleToggle}
      >
        <div className='min-h-14 flex flex-shrink-0 justify-between items-center py-3.5 px-4 gap-x-4'>
          <div className='flex flex-row items-center gap-x-2'>
            {icon && <Icon className='flex-shrink-0' name={icon} />}
            <Text.H5M userSelect={false}>{title}</Text.H5M>
          </div>
          <div className='flex flex-row flex-grow min-w-0 items-center gap-x-2'>
            <div className='flex-grow min-w-0'>
              {isExpanded ? expandedContentHeader : collapsedContentHeader}
            </div>
            <Icon
              className='flex-none'
              name={isExpanded ? 'chevronUp' : 'chevronDown'}
            />
          </div>
        </div>
        {!isExpanded && collapsedContent && (
          <div className='px-4 pb-4'>{collapsedContent}</div>
        )}
      </div>
      <div
        className={cn('transition-all duration-300 ease-in-out ', {
          'flex flex-col min-h-0': !scrollable,
          'overflow-y-auto custom-scrollbar': scrollable,
        })}
        style={{
          maxHeight: isExpanded ? expandedHeight : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        {expandedContent && (
          <div
            className={cn('pl-4', {
              'flex min-h-0': !scrollable,
              'pr-4': paddingRight,
              'pb-3.5': paddingBottom,
            })}
          >
            {expandedContent}
          </div>
        )}
      </div>
    </div>
  )
}
