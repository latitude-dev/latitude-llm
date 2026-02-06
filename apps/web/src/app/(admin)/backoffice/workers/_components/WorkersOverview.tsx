'use client'

import { useState } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useQueueStats, useWorkerActions } from '$/stores/admin/workers'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'
import type { QueueStats } from '@latitude-data/core/services/workers/inspect'

import { QueueDetailPanel } from './QueueDetailPanel'

export function WorkersOverview() {
  const { data: stats, mutate } = useQueueStats()
  const { drainQueue, isDrainingQueue } = useWorkerActions()
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null)
  const [drainTarget, setDrainTarget] = useState<string | null>(null)

  const totalActive = stats.reduce((sum, q) => sum + q.active, 0)
  const totalWaiting = stats.reduce((sum, q) => sum + q.waiting, 0)
  const totalDelayed = stats.reduce((sum, q) => sum + q.delayed, 0)

  const handleDrainConfirm = async () => {
    if (!drainTarget) return
    await drainQueue({ queueName: drainTarget })
    setDrainTarget(null)
    mutate()
  }

  return (
    <div className='container mx-auto p-6 max-w-7xl'>
      <div className='flex flex-col gap-8'>
        <div className='flex flex-col gap-2'>
          <div className='flex flex-row items-center justify-between'>
            <div className='flex flex-row items-center gap-3'>
              <div className='p-2 bg-accent rounded-lg'>
                <Icon name='cpu' size='normal' color='primary' />
              </div>
              <div>
                <Text.H1>Workers</Text.H1>
                <Text.H4 color='foregroundMuted'>
                  Live queue status and management
                </Text.H4>
              </div>
            </div>
            <Button
              variant='outline'
              size='small'
              onClick={() => mutate()}
              iconProps={{ name: 'refresh' }}
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-3 gap-4'>
          <StatCard label='Active' value={totalActive} variant='accent' />
          <StatCard label='Waiting' value={totalWaiting} variant='default' />
          <StatCard
            label='Delayed'
            value={totalDelayed}
            variant='warningMuted'
          />
        </div>

        <DataTable
          title='Queues'
          count={stats.length}
          columns={[
            { header: 'Queue' },
            { header: 'Active' },
            { header: 'Waiting' },
            { header: 'Delayed' },
            { header: 'Actions' },
          ]}
          emptyMessage='No queues found'
          icon='cpu'
        >
          {stats.map((queue) => (
            <QueueRow
              key={queue.name}
              queue={queue}
              isSelected={selectedQueue === queue.name}
              onSelect={() =>
                setSelectedQueue(
                  selectedQueue === queue.name ? null : queue.name,
                )
              }
              onDrain={() => setDrainTarget(queue.name)}
            />
          ))}
        </DataTable>

        {selectedQueue && (
          <QueueDetailPanel
            queueName={selectedQueue}
            onClose={() => setSelectedQueue(null)}
            onMutateStats={mutate}
          />
        )}

        {drainTarget && (
          <ConfirmModal
            dismissible
            open={!!drainTarget}
            title={`Drain queue: ${drainTarget}`}
            type='destructive'
            onOpenChange={(open) => {
              if (!open) setDrainTarget(null)
            }}
            onConfirm={handleDrainConfirm}
            onCancel={() => setDrainTarget(null)}
            confirm={{
              label: isDrainingQueue ? 'Draining...' : 'Drain Queue',
              description:
                'This will remove all waiting and delayed jobs from this queue. Jobs already being processed will not be affected. Use this when a queue is overwhelmed and needs to be cleared.',
              disabled: isDrainingQueue,
              isConfirming: isDrainingQueue,
            }}
          />
        )}
      </div>
    </div>
  )
}

const STAT_VARIANT_STYLES = {
  accent: 'border-l-4 border-l-primary',
  default: 'border-l-4 border-l-foreground/30',
  warningMuted: 'border-l-4 border-l-yellow-500',
} as const

function StatCard({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: 'accent' | 'default' | 'warningMuted'
}) {
  return (
    <Card className={`p-4 ${STAT_VARIANT_STYLES[variant]}`}>
      <div className='flex flex-col gap-1'>
        <Text.H6 color='foregroundMuted'>{label}</Text.H6>
        <Text.H2>{value.toLocaleString()}</Text.H2>
      </div>
    </Card>
  )
}

function QueueRow({
  queue,
  isSelected,
  onSelect,
  onDrain,
}: {
  queue: QueueStats
  isSelected: boolean
  onSelect: () => void
  onDrain: () => void
}) {
  const hasActivity = queue.active > 0 || queue.waiting > 0 || queue.delayed > 0
  const hasBacklog = queue.waiting > 0 || queue.delayed > 0

  return (
    <TableRow
      className={`cursor-pointer transition-colors ${isSelected ? 'bg-accent/50' : ''}`}
      onClick={onSelect}
    >
      <TableCell className='p-2'>
        <div className='flex flex-row items-center gap-2'>
          {hasActivity && (
            <div className='w-2 h-2 rounded-full bg-green-500 animate-pulse' />
          )}
          <Text.H5>{queue.displayName}</Text.H5>
          <Text.H6 color='foregroundMuted' monospace>
            ({queue.name})
          </Text.H6>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={queue.active > 0 ? 'accent' : 'muted'} size='small'>
          {queue.active}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={queue.waiting > 0 ? 'default' : 'muted'} size='small'>
          {queue.waiting}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={queue.delayed > 0 ? 'warningMuted' : 'muted'}
          size='small'
        >
          {queue.delayed}
        </Badge>
      </TableCell>
      <TableCell>
        <div
          className='flex flex-row items-center gap-1'
          onClick={(e) => e.stopPropagation()}
        >
          {hasBacklog && (
            <Button variant='outline' size='small' onClick={onDrain}>
              Drain
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
