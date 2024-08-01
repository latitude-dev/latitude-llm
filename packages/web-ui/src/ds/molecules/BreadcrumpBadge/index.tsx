'use client'

import { useCallback } from 'react'

import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { Badge, Icons, Text, Tooltip } from '$ui/ds/atoms'

export function BreadcrumpBadge({
  uuid: fullUuid,
  title,
  isHead,
}: {
  uuid: string
  title?: string | null
  isHead: boolean
}) {
  const [uuid] = isHead ? [HEAD_COMMIT] : fullUuid.split('-')
  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(fullUuid)
  }, [fullUuid])
  return (
    <div className='flex flex-row items-center space-x-2'>
      <Text.H5M>{title ?? 'Untitled'}</Text.H5M>
      <Tooltip
        side='right'
        align='center'
        delayDuration={250}
        trigger={
          <div
            onClick={onCopy}
            className='cursor-pointer flex flex-row items-center gap-x-1'
          >
            <Badge variant={isHead ? 'accent' : 'muted'}>{uuid}</Badge>
            <Icons.clipboard className='w-4 h-4 text-muted-foreground' />
          </div>
        }
      >
        <Text.H6 color='white'>Click to copy: {fullUuid}</Text.H6>
      </Tooltip>
    </div>
  )
}
