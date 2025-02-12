'use client'

import { ReactNode, useEffect, useState } from 'react'

import { Icon, IconName, Text, cn } from '@latitude-data/web-ui'

export const COLLAPSED_BOX_HEIGHT = 56

export type OnExpandFn = (expanded: boolean) => void
export function CollapsibleBox({
  title,
  icon,
  collapsedContent,
  collapsedContentHeader,
  expandedContent,
  expandedContentHeader,
  expandedHeight,
  initialExpanded = false,
  onExpand,
}: {
  title: string
  icon?: IconName
  collapsedContent?: ReactNode
  collapsedContentHeader?: ReactNode
  expandedContent?: ReactNode
  expandedContentHeader?: ReactNode
  expandedHeight?: string
  initialExpanded?: boolean
  onExpand?: OnExpandFn
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  useEffect(() => {
    onExpand?.(isExpanded)
  }, [isExpanded])

  return (
    <div
      className={cn('w-full border rounded-lg custom-scrollbar relative', {
        'h-full': isExpanded,
        'h-auto': !isExpanded,
      })}
    >
      <div
        className='flex flex-col cursor-pointer sticky top-0 z-10 bg-background'
        onClick={() => setIsExpanded((prev) => !prev)}
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
        className='transition-all duration-300 ease-in-out overflow-y-auto custom-scrollbar'
        style={{
          maxHeight: isExpanded ? expandedHeight : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        {expandedContent && (
          <div className='pb-3.5 px-4'>{expandedContent}</div>
        )}
      </div>
    </div>
  )
}
