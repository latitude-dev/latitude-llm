'use client'

import { ReactNode, useCallback } from 'react'

import { cn } from '../../../lib/utils'
import { Icon, toast, Tooltip } from '../../atoms'

export function ClickToCopy({
  copyValue,
  children,
  fullWidth = false,
  showIcon = true,
}: {
  copyValue: string
  children: ReactNode
  fullWidth?: boolean
  showIcon?: boolean
}) {
  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(copyValue)
    toast({
      title: 'Copied to clipboard',
      description: 'The snippet has been copied to your clipboard',
    })
  }, [copyValue])

  return (
    <Tooltip
      side='right'
      align='center'
      delayDuration={250}
      variant='inverse'
      asChild
      trigger={
        <div
          onClick={onCopy}
          className={cn('cursor-pointer flex flex-row items-center gap-x-2', {
            'w-full': fullWidth,
          })}
        >
          {children}
          {showIcon && (
            <Icon name='clipboard' className='text-muted-foreground' />
          )}
        </div>
      }
    >
      Click to copy: {copyValue}
    </Tooltip>
  )
}
