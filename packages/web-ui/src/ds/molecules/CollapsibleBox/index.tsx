'use client'

import { ReactNode, useCallback, useState } from 'react'

import { Icon, IconName, Text } from '@latitude-data/web-ui'

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

  const toggleExpand = useCallback(() => {
    setIsExpanded((prevExpanded) => {
      const nextExpanded = !prevExpanded
      onExpand?.(nextExpanded)
      return nextExpanded
    })
  }, [])

  // TODO: Fix header should have minimum height

  return (
    <div className='w-full border rounded-lg custom-scrollbar relative'>
      <div
        className='flex flex-col cursor-pointer sticky top-0 z-10 bg-background'
        onClick={toggleExpand}
      >
        <div className='flex justify-between items-center py-3.5 px-4'>
          <div className='flex flex-row items-center gap-x-2'>
            {icon && <Icon className='flex-shrink-0' name={icon} />}
            <Text.H5M userSelect={false}>{title}</Text.H5M>
          </div>
          <div className='flex flex-row items-center gap-x-2'>
            <div onClick={(e) => e.stopPropagation()}>
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
