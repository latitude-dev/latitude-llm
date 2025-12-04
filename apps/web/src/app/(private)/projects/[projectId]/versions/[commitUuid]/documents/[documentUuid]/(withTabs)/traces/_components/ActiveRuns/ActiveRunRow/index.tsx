'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { ActiveRun } from '@latitude-data/constants'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import { formatDuration } from '$/app/_lib/formatUtils'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { TraceSpanSelectionContext } from '../../TraceSpanSelectionContext'

export function ActiveRunRow({ run }: { run: ActiveRun }) {
  const { onClickTraceRow } = use(TraceSpanSelectionContext)
  const [duration, setDuration] = useState<number>(0)

  const message = useMemo(() => {
    return run.startedAt
      ? run.caption || 'Waiting for a response...'
      : 'Waiting to get started...'
  }, [run])

  useEffect(() => {
    const startTime = run.startedAt
      ? new Date(run.startedAt).getTime()
      : new Date(run.queuedAt).getTime()

    const updateDuration = () => {
      const elapsed = Date.now() - startTime
      setDuration(elapsed)
    }

    // Update immediately
    updateDuration()

    // Update every 100ms
    const interval = setInterval(updateDuration, 100)

    return () => clearInterval(interval)
  }, [run.startedAt, run.queuedAt])

  return (
    <TableRow
      onClick={onClickTraceRow({
        type: 'activeRun',
        data: { runUuid: run.uuid },
      })}
      className={cn(
        'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border bg-accent/5',
      )}
    >
      <TableCell>
        <Icon name='loader' spin />
      </TableCell>
      <TableCell>
        <div className='flex items-center gap-2'>
          <Text.H5 noWrap color='foregroundMuted' userSelect={false} animate>
            {message}
          </Text.H5>
        </div>
      </TableCell>
      <TableCell>
        <Skeleton height='h5' className='w-20' />
      </TableCell>
      <TableCell>
        <Text.H5 noWrap color='foregroundMuted'>
          {run.source ?? '-'}
        </Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5 noWrap color='foregroundMuted'>
          {formatDuration(duration, false)}
        </Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5 noWrap color='foregroundMuted'>
          -
        </Text.H5>
      </TableCell>
    </TableRow>
  )
}
