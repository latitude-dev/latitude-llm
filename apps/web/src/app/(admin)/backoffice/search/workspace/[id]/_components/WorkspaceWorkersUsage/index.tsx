'use client'

import { useState } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useWorkspaceWorkerUsage,
  useWorkerActions,
} from '$/stores/admin/workers'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'

export function WorkspaceWorkersUsage({
  workspaceId,
}: {
  workspaceId: number
}) {
  const { data: usage, mutate } = useWorkspaceWorkerUsage(workspaceId)
  const { removeWorkspaceJobs, isRemovingWorkspaceJobs } = useWorkerActions()
  const [confirmKillAll, setConfirmKillAll] = useState(false)
  const [confirmKillQueue, setConfirmKillQueue] = useState<string | null>(null)

  const totalJobs = usage.reduce((sum, q) => sum + q.total, 0)

  const handleKillAll = async () => {
    await removeWorkspaceJobs({ workspaceId })
    setConfirmKillAll(false)
    mutate()
  }

  const handleKillQueue = async () => {
    if (!confirmKillQueue) return
    await removeWorkspaceJobs({ workspaceId, queueName: confirmKillQueue })
    setConfirmKillQueue(null)
    mutate()
  }

  return (
    <Card className='p-6'>
      <div className='flex flex-col gap-6'>
        <div className='flex flex-row items-center justify-between'>
          <div className='flex flex-row items-center gap-3'>
            <div className='p-2 bg-accent rounded-lg'>
              <Icon name='cpu' size='normal' color='primary' />
            </div>
            <div>
              <Text.H3>Workers Usage</Text.H3>
              <Text.H6 color='foregroundMuted'>
                Active and queued jobs for this workspace
              </Text.H6>
            </div>
          </div>
          <div className='flex flex-row items-center gap-2'>
            <Button
              variant='outline'
              size='small'
              onClick={() => mutate()}
              iconProps={{ name: 'refresh' }}
            >
              Refresh
            </Button>
            {totalJobs > 0 && (
              <Button
                variant='destructive'
                size='small'
                onClick={() => setConfirmKillAll(true)}
              >
                Kill All Jobs ({totalJobs})
              </Button>
            )}
          </div>
        </div>

        {totalJobs === 0 ? (
          <div className='py-6 text-center'>
            <Text.H5 color='foregroundMuted'>
              No active or queued jobs for this workspace
            </Text.H5>
          </div>
        ) : (
          <DataTable
            title=''
            count={usage.length}
            columns={[
              { header: 'Queue' },
              { header: 'Total' },
              { header: 'Job Types' },
              { header: 'Actions' },
            ]}
            emptyMessage='No active jobs'
            noCard
          >
            {usage.map((q) => (
              <TableRow key={q.queueName}>
                <TableCell className='p-2'>
                  <div className='flex flex-row items-center gap-2'>
                    <div className='w-2 h-2 rounded-full bg-green-500 animate-pulse' />
                    <Text.H5>{q.displayName}</Text.H5>
                    <Text.H6 color='foregroundMuted' monospace>
                      ({q.queueName})
                    </Text.H6>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant='accent' size='small'>
                    {q.total}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className='flex flex-row flex-wrap gap-1'>
                    {Object.entries(q.jobCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([jobName, count]) => (
                        <Badge key={jobName} variant='muted' size='small'>
                          {jobName}: {count}
                        </Badge>
                      ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant='destructive'
                    size='small'
                    onClick={() => setConfirmKillQueue(q.queueName)}
                  >
                    Kill
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}
      </div>

      {confirmKillAll && (
        <ConfirmModal
          dismissible
          open={confirmKillAll}
          title={`Kill all jobs for Workspace #${workspaceId}`}
          type='destructive'
          onOpenChange={setConfirmKillAll}
          onConfirm={handleKillAll}
          onCancel={() => setConfirmKillAll(false)}
          confirm={{
            label: isRemovingWorkspaceJobs ? 'Removing...' : 'Kill All Jobs',
            description: `This will remove all waiting and delayed jobs for this workspace across all queues. Active jobs cannot be removed.`,
            disabled: isRemovingWorkspaceJobs,
            isConfirming: isRemovingWorkspaceJobs,
          }}
        />
      )}

      {confirmKillQueue && (
        <ConfirmModal
          dismissible
          open={!!confirmKillQueue}
          title={`Kill jobs from ${confirmKillQueue}`}
          type='destructive'
          onOpenChange={(open) => {
            if (!open) setConfirmKillQueue(null)
          }}
          onConfirm={handleKillQueue}
          onCancel={() => setConfirmKillQueue(null)}
          confirm={{
            label: isRemovingWorkspaceJobs ? 'Removing...' : 'Kill Queue Jobs',
            description: `This will remove all waiting and delayed jobs for this workspace from the ${confirmKillQueue} queue.`,
            disabled: isRemovingWorkspaceJobs,
            isConfirming: isRemovingWorkspaceJobs,
          }}
        />
      )}
    </Card>
  )
}
