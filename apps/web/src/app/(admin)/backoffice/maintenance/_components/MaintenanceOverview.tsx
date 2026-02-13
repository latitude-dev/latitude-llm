'use client'

import { useState } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useMaintenanceData,
  useMaintenanceActions,
} from '$/stores/admin/maintenance'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'
import type { MaintenanceJobDefinition } from '@latitude-data/core/services/maintenance/registry'
import type { JobInfo } from '@latitude-data/core/services/workers/inspect'

import { TriggerJobModal } from './TriggerJobModal'
import { JobLogPanel } from './JobLogPanel'

export function MaintenanceOverview() {
  const { registry, activeJobs, waitingJobs, mutate } = useMaintenanceData()
  const { triggerJob, isTriggering } = useMaintenanceActions()
  const [triggerTarget, setTriggerTarget] =
    useState<MaintenanceJobDefinition | null>(null)
  const [confirmTarget, setConfirmTarget] =
    useState<MaintenanceJobDefinition | null>(null)
  const [logJobId, setLogJobId] = useState<string | null>(null)

  const handleTriggerClick = (job: MaintenanceJobDefinition) => {
    const hasRequiredParams = job.params.some((p) => p.required)
    if (hasRequiredParams) {
      setTriggerTarget(job)
    } else {
      setConfirmTarget(job)
    }
  }

  const handleConfirmTrigger = async () => {
    if (!confirmTarget) return
    await triggerJob({ jobName: confirmTarget.name })
    setConfirmTarget(null)
    mutate()
  }

  const handleTriggerSubmit = async (params: Record<string, unknown>) => {
    if (!triggerTarget) return
    await triggerJob({ jobName: triggerTarget.name, params })
    setTriggerTarget(null)
    mutate()
  }

  const jobHasLogs = (job: JobInfo) => {
    const def = registry.find((r) => r.name === job.name)
    return def?.hasLogs ?? false
  }

  return (
    <div className='container mx-auto p-6 max-w-7xl'>
      <div className='flex flex-col gap-8'>
        <div className='flex flex-col gap-2'>
          <div className='flex flex-row items-center justify-between'>
            <div className='flex flex-row items-center gap-3'>
              <div className='p-2 bg-accent rounded-lg'>
                <Icon name='settings' size='normal' color='primary' />
              </div>
              <div>
                <Text.H1>Maintenance Jobs</Text.H1>
                <Text.H4 color='foregroundMuted'>
                  Trigger and monitor maintenance jobs
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

        <DataTable
          title='Available Jobs'
          count={registry.length}
          columns={[
            { header: 'Job' },
            { header: 'Description' },
            { header: 'Parameters' },
            { header: 'Actions' },
          ]}
          emptyMessage='No jobs registered'
          icon='wrench'
        >
          {registry.map((job) => (
            <TableRow key={job.name}>
              <TableCell className='p-2'>
                <div className='flex flex-col gap-1'>
                  <Text.H5>{job.displayName}</Text.H5>
                  <Text.H6 color='foregroundMuted' monospace>
                    {job.name}
                  </Text.H6>
                </div>
              </TableCell>
              <TableCell>
                <Text.H6 color='foregroundMuted'>{job.description}</Text.H6>
              </TableCell>
              <TableCell>
                {job.params.length === 0 ? (
                  <Badge variant='muted' size='small'>
                    None
                  </Badge>
                ) : (
                  <div className='flex flex-wrap gap-1'>
                    {job.params.map((p) => (
                      <Badge
                        key={p.name}
                        variant={p.required ? 'accent' : 'muted'}
                        size='small'
                      >
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant='outline'
                  size='small'
                  onClick={() => handleTriggerClick(job)}
                  disabled={isTriggering}
                >
                  Trigger
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>

        <DataTable
          title='Active Jobs'
          count={activeJobs.length}
          columns={[
            { header: 'ID' },
            { header: 'Job' },
            { header: 'Data' },
            { header: 'Attempts' },
            { header: 'Actions' },
          ]}
          emptyMessage='No active jobs'
          icon='play'
        >
          {activeJobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              showLogs={jobHasLogs(job)}
              onViewLogs={() => setLogJobId(job.id)}
            />
          ))}
        </DataTable>

        <DataTable
          title='Waiting Jobs'
          count={waitingJobs.length}
          columns={[
            { header: 'ID' },
            { header: 'Job' },
            { header: 'Data' },
            { header: 'Attempts' },
            { header: 'Actions' },
          ]}
          emptyMessage='No waiting jobs'
          icon='clock'
        >
          {waitingJobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              showLogs={jobHasLogs(job)}
              onViewLogs={() => setLogJobId(job.id)}
            />
          ))}
        </DataTable>

        {logJobId && (
          <JobLogPanel jobId={logJobId} onClose={() => setLogJobId(null)} />
        )}

        {triggerTarget && (
          <TriggerJobModal
            job={triggerTarget}
            isTriggering={isTriggering}
            onSubmit={handleTriggerSubmit}
            onClose={() => setTriggerTarget(null)}
          />
        )}

        {confirmTarget && (
          <ConfirmModal
            dismissible
            open={!!confirmTarget}
            title={`Trigger: ${confirmTarget.displayName}`}
            type='default'
            onOpenChange={(open) => {
              if (!open) setConfirmTarget(null)
            }}
            onConfirm={handleConfirmTrigger}
            onCancel={() => setConfirmTarget(null)}
            confirm={{
              label: isTriggering ? 'Triggering...' : 'Trigger',
              description: confirmTarget.description,
              disabled: isTriggering,
              isConfirming: isTriggering,
            }}
          />
        )}
      </div>
    </div>
  )
}

function JobRow({
  job,
  showLogs,
  onViewLogs,
}: {
  job: JobInfo
  showLogs: boolean
  onViewLogs: () => void
}) {
  const dataStr = Object.entries(job.data)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  return (
    <TableRow>
      <TableCell className='p-2'>
        <Text.H6 monospace>{job.id}</Text.H6>
      </TableCell>
      <TableCell>
        <Text.H5>{job.name}</Text.H5>
      </TableCell>
      <TableCell>
        <Text.H6 color='foregroundMuted' monospace>
          {dataStr || '—'}
        </Text.H6>
      </TableCell>
      <TableCell>
        <Badge
          variant={job.attemptsMade > 0 ? 'warningMuted' : 'muted'}
          size='small'
        >
          {job.attemptsMade}
        </Badge>
      </TableCell>
      <TableCell>
        {showLogs && (
          <Button
            variant='outline'
            size='small'
            onClick={onViewLogs}
            iconProps={{ name: 'file' }}
          >
            Logs
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
