'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { type ReactNode, useState } from 'react'

export function CollapsibleContent({
  children,
  maxCollapsedHeight = 100,
}: {
  children: ReactNode
  maxCollapsedHeight?: number
}) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  return (
    <div className='relative'>
      <div
        className='w-full transition-all duration-300 ease-in-out'
        style={{
          overflow: isCollapsed ? 'hidden' : 'visible',
          maxHeight: isCollapsed ? `${maxCollapsedHeight}px` : 'unset',
        }}
      >
        {children}
      </div>
      {isCollapsed && (
        <div
          className='absolute bottom-0 left-0 right-0 h-[80px] bg-gradient-to-t from-backgroundCode from-30% via-backgroundCode/70 via-60% to-transparent pointer-events-none'
          style={{ marginTop: '-80px' }}
        />
      )}
      <div className='flex justify-center'>
        <Button
          fullWidth
          variant='ghost'
          size='small'
          onClick={(e) => {
            e.preventDefault()
            setIsCollapsed(!isCollapsed)
          }}
        >
          <Text.H6 color='foregroundMuted'>{isCollapsed ? 'Show more +' : 'Show less -'}</Text.H6>
        </Button>
      </div>
    </div>
  )
}
