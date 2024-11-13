'use client'

import { ReactNode, useCallback } from 'react'

import { Icon, toast, Tooltip } from '../../atoms'

export function ClickToCopy({
  copyValue,
  children,
}: {
  copyValue: string
  children: ReactNode
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
      trigger={
        <div
          onClick={onCopy}
          className='cursor-pointer flex flex-row items-center gap-x-2'
        >
          {children}
          <Icon name='clipboard' className='text-muted-foreground' />
        </div>
      }
    >
      Click to copy: {copyValue}
    </Tooltip>
  )
}
