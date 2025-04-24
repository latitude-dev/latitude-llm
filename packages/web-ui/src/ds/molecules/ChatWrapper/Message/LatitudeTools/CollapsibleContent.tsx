'use client'

import { Button } from '../../../../atoms/Button'
import { Text } from '../../../../atoms/Text'
import { cn } from '../../../../../lib/utils'
import { ReactNode, useState } from 'react'

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
        className={cn('w-full transition-all duration-300 ease-in-out', {
          [`max-h-[${maxCollapsedHeight}px]`]: isCollapsed,
          'max-h-[2000px]': !isCollapsed, // Large enough to fit content
        })}
        style={{ overflow: isCollapsed ? 'hidden' : 'visible' }}
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
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <Text.H6 color='foregroundMuted'>
            {isCollapsed ? 'Show more +' : 'Show less -'}
          </Text.H6>
        </Button>
      </div>
    </div>
  )
}
