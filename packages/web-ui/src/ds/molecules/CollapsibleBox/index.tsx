'use client'

import { ReactNode, useCallback, useState } from 'react'

import { Icon, Text } from '@latitude-data/web-ui'

export function CollapsibleBox({
  title,
  collapsedContent,
  expandedContent,
  expandedHeight,
  initialExpanded = false,
}: {
  title: string
  collapsedContent: ReactNode
  expandedContent?: ReactNode
  expandedHeight?: string
  initialExpanded?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  const toggleExpand = useCallback(() => {
    setIsExpanded((prevExpanded) => !prevExpanded)
  }, [])

  return (
    <div className='border rounded-lg custom-scrollbar relative'>
      <div
        className='flex flex-col cursor-pointer sticky top-0 z-10 bg-background'
        onClick={toggleExpand}
      >
        <div className='flex justify-between items-center py-3.5 px-4'>
          <Text.H5M>{title}</Text.H5M>
          <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} />
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
