'use client'

import { ReactNode, useCallback } from 'react'

import { Icon, Text, Tooltip } from '../../atoms'

export function ClickToCopy({
  copyValue,
  children,
}: {
  copyValue: string
  children: ReactNode
}) {
  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(copyValue)
  }, [copyValue])

  return (
    <Tooltip
      side='right'
      align='center'
      delayDuration={250}
      trigger={
        <div
          onClick={onCopy}
          className='cursor-pointer flex flex-row items-center gap-x-1'
        >
          {children}
          <Icon name='clipboard' className='text-muted-foreground' />
        </div>
      }
    >
      <Text.H6>Click to copy: {copyValue}</Text.H6>
    </Tooltip>
  )
}
