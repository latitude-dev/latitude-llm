'use client'

import React, { useState } from 'react'

import { Icon, Text } from '@latitude-data/web-ui'

interface CollapsibleBoxProps {
  title: string
  collapsedContent: React.ReactNode
  expandedContent: React.ReactNode
  expandedHeight?: string
}

export const CollapsibleBox: React.FC<CollapsibleBoxProps> = ({
  title,
  collapsedContent,
  expandedContent,
  expandedHeight = 'auto',
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleExpand = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className='border rounded-lg'>
      <div className='flex flex-col cursor-pointer' onClick={toggleExpand}>
        <div className='flex justify-between items-center p-4'>
          <Text.H5M>{title}</Text.H5M>
          <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} />
        </div>
        {!isExpanded && <div className='px-4 pb-4'>{collapsedContent}</div>}
      </div>
      <div
        className='transition-all duration-300 ease-in-out overflow-y-auto custom-scrollbar'
        style={{
          maxHeight: isExpanded ? expandedHeight : '0',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className='p-4'>{expandedContent}</div>
      </div>
    </div>
  )
}
