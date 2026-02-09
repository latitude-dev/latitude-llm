'use client'

import { useState } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useQueueDetail, useWorkerActions } from '$/stores/admin/workers'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import Link from 'next/link'

type ConfirmState =
  | { type: 'drain' }
  | { type: 'workspace'; workspaceId: number }

export function QueueDetailPanel({
  queueName,
  onClose,
  onMutateStats,
}: {
  queueName: string
  onClose: () => void
  onMutateStats: () => void
}) {
  const { data, mutate } = useQueueDetail(queueName)
  const {
    drainQueue,
    isDrainingQueue,
    removeWorkspaceJobs,
    isRemovingWorkspaceJobs,
  } = useWorkerActions()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  if (!data) {
    return (
      <Card className='p-6'>
        <div className='flex items-center gap-2'>
          <Icon name='loader' className='animate-spin' />
          <Text.H5 color='foregroundMuted'>Loading queue details...</Text.H5>
        </div>
      </Card>
    )
  }

  const isProcessing = isDrainingQueue || isRemovingWorkspaceJobs

  const handleConfirm = async () => {
    if (!confirm) return

    if (confirm.type === 'drain') {
      await drainQueue({ queueName })
    } else {
      await removeWorkspaceJobs({
        workspaceId: confirm.workspaceId,
        queueName,
      })
    }

    setConfirm(null)
    mutate()
    onMutateStats()
  }

  const allWorkspaces = new Map<number, number>()
  for (const job of data.jobBreakdown) {
    for (const [wsId, count] of Object.entries(job.workspaces)) {
      const id = Number(wsId)
      allWorkspaces.set(id, (allWorkspaces.get(id) ?? 0) + count)
    }
  }
  const sortedWorkspaces = Array.from(allWorkspaces.entries()).sort(
    (a, b) => b[1] - a[1],
  )

  const hasBacklog = data.stats.waiting > 0 || data.stats.delayed > 0

  return (
    <Card className='p-6'>
      <div className='flex flex-col gap-6'>
        <div className='flex flex-row items-center justify-between'>
          <div className='flex flex-row items-center gap-3'>
            <div className='p-2 bg-accent rounded-lg'>
              <Icon name='cpu' size='normal' color='primary' />
            </div>
            <div>
              <Text.H3>{data.stats.displayName}</Text.H3>
              <Text.H6 color='foregroundMuted' monospace>
                {data.stats.name}
              </Text.H6>
            </div>
          </div>
          <div className='flex flex-row items-center gap-2'>
            {hasBacklog && (
              <Button
                variant='destructive'
                size='small'
                onClick={() => setConfirm({ type: 'drain' })}
              >
                Drain Entire Queue
              </Button>
            )}
            <Button variant='ghost' size='small' onClick={onClose}>
              <Icon name='close' />
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-3 gap-3'>
          <MiniStat label='Active' value={data.stats.active} variant='accent' />
          <MiniStat
            label='Waiting'
            value={data.stats.waiting}
            variant='default'
          />
          <MiniStat
            label='Delayed'
            value={data.stats.delayed}
            variant='warningMuted'
          />
        </div>

        <DataTable
          title={`Job Breakdown (${data.jobBreakdown.length} types)`}
          count={data.jobBreakdown.length}
          columns={[
            { header: 'Job Name' },
            { header: 'Count' },
            { header: 'Workspaces' },
          ]}
          emptyMessage='No jobs in this queue'
          noCard
        >
          {data.jobBreakdown.map((job) => (
            <TableRow key={job.jobName}>
              <TableCell className='p-2'>
                <Text.H5 monospace>{job.jobName}</Text.H5>
              </TableCell>
              <TableCell>
                <Badge variant='default' size='small'>
                  {job.count}
                </Badge>
              </TableCell>
              <TableCell>
                <div className='flex flex-row flex-wrap gap-1'>
                  {Object.entries(job.workspaces)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([wsId, count]) => (
                      <Link
                        key={wsId}
                        href={ROUTES.backoffice[
                          BackofficeRoutes.search
                        ].workspace(Number(wsId))}
                      >
                        <Badge variant='muted' size='small'>
                          WS#{wsId}: {count}
                        </Badge>
                      </Link>
                    ))}
                  {Object.keys(job.workspaces).length > 5 && (
                    <Badge variant='muted' size='small'>
                      +{Object.keys(job.workspaces).length - 5} more
                    </Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>

        {sortedWorkspaces.length > 0 && (
          <DataTable
            title={`Workspace Usage (${sortedWorkspaces.length} workspaces)`}
            count={sortedWorkspaces.length}
            columns={[
              { header: 'Workspace' },
              { header: 'Jobs' },
              { header: 'Actions' },
            ]}
            emptyMessage='No workspace data'
            noCard
          >
            {sortedWorkspaces.map(([wsId, count]) => (
              <TableRow key={wsId}>
                <TableCell className='p-2'>
                  <Link
                    href={ROUTES.backoffice[BackofficeRoutes.search].workspace(
                      wsId,
                    )}
                  >
                    <Text.H5 color='primary'>Workspace #{wsId}</Text.H5>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant='default' size='small'>
                    {count}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant='destructive'
                    size='small'
                    onClick={() =>
                      setConfirm({ type: 'workspace', workspaceId: wsId })
                    }
                  >
                    Kill Jobs
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}
      </div>

      {confirm && (
        <ConfirmModal
          dismissible
          open={!!confirm}
          title={
            confirm.type === 'drain'
              ? `Drain entire queue: ${data.stats.displayName}`
              : `Kill jobs for Workspace #${confirm.workspaceId}`
          }
          type='destructive'
          onOpenChange={(open) => {
            if (!open) setConfirm(null)
          }}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
          confirm={{
            label: isProcessing
              ? 'Processing...'
              : confirm.type === 'drain'
                ? 'Drain Entire Queue'
                : 'Kill Workspace Jobs',
            description:
              confirm.type === 'drain'
                ? `This will remove all ${data.stats.waiting + data.stats.delayed} waiting and delayed jobs from the ${data.stats.displayName} queue. Jobs already being processed by workers will not be affected. This cannot be undone.`
                : `This will remove all waiting and delayed jobs for workspace #${confirm.workspaceId} from the ${data.stats.displayName} queue. Jobs already being processed cannot be removed. This cannot be undone.`,
            disabled: isProcessing,
            isConfirming: isProcessing,
          }}
        />
      )}
    </Card>
  )
}

const MINI_STAT_STYLES = {
  accent: 'border-l-4 border-l-primary',
  default: 'border-l-4 border-l-foreground/30',
  warningMuted: 'border-l-4 border-l-yellow-500',
} as const

function MiniStat({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: 'accent' | 'default' | 'warningMuted'
}) {
  return (
    <div
      className={`flex flex-col gap-1 p-3 bg-muted/30 rounded-lg ${MINI_STAT_STYLES[variant]}`}
    >
      <Text.H6 color='foregroundMuted'>{label}</Text.H6>
      <Text.H4>{value.toLocaleString()}</Text.H4>
    </div>
  )
}
