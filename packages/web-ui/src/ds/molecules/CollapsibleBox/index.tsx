'use client'

import { ReactNode, useCallback, useState } from 'react'

import { Icon, Text } from '@latitude-data/web-ui'

export type OnExpandFn = (expanded: boolean) => void
export function CollapsibleBox({
  title,
  collapsedContent,
  collapsedContentHeader,
  expandedContent,
  expandedHeight,
  initialExpanded = false,
  onExpand,
}: {
  title: string
  collapsedContent: ReactNode
  collapsedContentHeader?: ReactNode
  expandedContent?: ReactNode
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

  return (
    <div className='w-full border rounded-lg custom-scrollbar relative'>
      <div
        className='flex flex-col cursor-pointer sticky top-0 z-10 bg-background'
        onClick={toggleExpand}
      >
        <div className='flex justify-between items-center py-3.5 px-4'>
          <Text.H5M>{title}</Text.H5M>
          <div className='flex flex-row items-center gap-x-2'>
            {!isExpanded ? (
              <div onClick={(e) => e.stopPropagation()}>
                {collapsedContentHeader}
              </div>
            ) : null}
            <Icon
              className='flex-none'
              name={isExpanded ? 'chevronUp' : 'chevronDown'}
            />
          </div>
        </div>
        {!isExpanded && collapsedContent ? (
          <div className='px-4 pb-4'>{collapsedContent}</div>
        ) : null}
      </div>
      <div
        className='transition-all duration-300 ease-in-out overflow-y-auto custom-scrollbar'
        style={{
          maxHeight: isExpanded ? expandedHeight : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className='pb-3.5 px-4'>{expandedContent}</div>
      </div>
    </div>
  )
}
