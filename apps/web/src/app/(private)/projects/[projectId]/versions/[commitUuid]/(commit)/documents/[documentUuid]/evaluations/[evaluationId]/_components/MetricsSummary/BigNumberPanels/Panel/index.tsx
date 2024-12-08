'use client'

import { ReactNode, useCallback, useState } from 'react'

import { cn, Icon, Skeleton, Text, Tooltip } from '@latitude-data/web-ui'

export default function Panel({
  label,
  value,
  additionalInfo,
  children,
  loading = false,
}: {
  label: string
  value?: string
  additionalInfo?: string
  children?: ReactNode
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  // On hover panel show tooltip with additional info
  const onMouseEnter = useCallback(() => {
    if (!additionalInfo) return

    setOpen(true)
  }, [additionalInfo])
  const onMouseLeave = useCallback(() => {
    setOpen(false)
  }, [])

  return (
    <Tooltip
      open={open}
      align='end'
      trigger={
        <div
          className={cn(
            'h-full flex-1 flex flex-col gap-1 p-4 rounded-lg border border-border',
            { 'cursor-default': !additionalInfo },
          )}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <div className='flex flex-row justify-between items-center gap-1'>
            <Text.H5 color='foregroundMuted'>{label}</Text.H5>
            {additionalInfo && (
              <Icon name='info' className='text-muted-foreground' />
            )}
          </div>
          {loading ? (
            <Skeleton className='w-16 mt-4' height='h4' />
          ) : value ? (
            <Text.H3B>{value}</Text.H3B>
          ) : null}
          {children}
        </div>
      }
    >
      {additionalInfo}
    </Tooltip>
  )
}
