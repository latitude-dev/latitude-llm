'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useQueueJobs } from '$/stores/admin/workers'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'

const MAX_FAILED_REASON_LENGTH = 240

export function FailedJobsSection({ queueName }: { queueName: string }) {
  const [filter, setFilter] = useState('')
  const { data: jobs, isLoading } = useQueueJobs(queueName, 'failed')

  const filtered = useMemo(() => {
    if (!filter.trim()) return jobs
    const needle = filter.trim().toLowerCase()
    return jobs.filter((job) => {
      const haystack = JSON.stringify(job.data ?? {}).toLowerCase()
      if (haystack.includes(needle)) return true
      if (job.id?.toLowerCase().includes(needle)) return true
      if (job.failedReason?.toLowerCase().includes(needle)) return true
      return false
    })
  }, [jobs, filter])

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-row items-center justify-between gap-3'>
        <Text.H4>Failed jobs</Text.H4>
        <Input
          placeholder='Filter by trace_id, span_id, workspace_id, error...'
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className='max-w-md'
        />
      </div>

      {isLoading && (
        <div className='flex items-center gap-2'>
          <Icon name='loader' className='animate-spin' />
          <Text.H6 color='foregroundMuted'>Loading failed jobs...</Text.H6>
        </div>
      )}

      <DataTable
        title={`Failed (${filtered.length}${filter ? ` of ${jobs.length}` : ''})`}
        count={filtered.length}
        columns={[
          { header: 'Job' },
          { header: 'Attempts' },
          { header: 'Failure' },
          { header: 'Data' },
        ]}
        emptyMessage={
          filter
            ? 'No failed jobs match this filter'
            : 'No failed jobs in this queue'
        }
        noCard
      >
        {filtered.map((job) => (
          <FailedJobRow key={job.id} job={job} />
        ))}
      </DataTable>

      {!isLoading && jobs.length >= 500 && (
        <Text.H6 color='foregroundMuted'>
          Showing the most recent 500 failed jobs. Older failures are not
          retained.
        </Text.H6>
      )}
    </div>
  )
}

function FailedJobRow({
  job,
}: {
  job: {
    id: string
    name: string
    data: Record<string, unknown>
    attemptsMade: number
    failedReason?: string
    finishedOn?: number
    workspaceId: number | null
  }
}) {
  const [expanded, setExpanded] = useState(false)
  const failedReason = job.failedReason ?? ''
  const truncated = failedReason.length > MAX_FAILED_REASON_LENGTH
  const displayedReason = expanded
    ? failedReason
    : failedReason.slice(0, MAX_FAILED_REASON_LENGTH)

  return (
    <TableRow>
      <TableCell className='align-top p-2'>
        <div className='flex flex-col gap-1'>
          <Text.H5 monospace>{job.name}</Text.H5>
          <Text.H6 color='foregroundMuted' monospace>
            id: {job.id}
          </Text.H6>
          {job.workspaceId !== null && (
            <Badge variant='muted' size='small'>
              WS#{job.workspaceId}
            </Badge>
          )}
          {job.finishedOn && (
            <Text.H6 color='foregroundMuted'>
              {new Date(job.finishedOn).toISOString()}
            </Text.H6>
          )}
        </div>
      </TableCell>
      <TableCell className='align-top'>
        <Badge variant='destructiveMuted' size='small'>
          {job.attemptsMade}
        </Badge>
      </TableCell>
      <TableCell className='align-top max-w-md'>
        <div className='flex flex-col gap-1'>
          <Text.H6 color='destructive' wordBreak='breakAll'>
            {displayedReason || '—'}
          </Text.H6>
          {truncated && (
            <Button
              variant='link'
              size='small'
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show full error'}
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className='align-top'>
        <pre className='max-w-md overflow-x-auto text-xs bg-muted/30 rounded p-2 whitespace-pre-wrap break-all'>
          {JSON.stringify(job.data, null, 2)}
        </pre>
      </TableCell>
    </TableRow>
  )
}
