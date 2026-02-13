'use client'

import { useState } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import type { MaintenanceJobDefinition } from '@latitude-data/core/services/maintenance/registry'

export function TriggerJobModal({
  job,
  isTriggering,
  onSubmit,
  onClose,
}: {
  job: MaintenanceJobDefinition
  isTriggering: boolean
  onSubmit: (params: Record<string, unknown>) => Promise<void>
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})

  const handleSubmit = async () => {
    const params: Record<string, unknown> = {}
    for (const param of job.params) {
      const val = values[param.name]
      if (val !== undefined && val !== '') {
        params[param.name] = param.type === 'number' ? Number(val) : val
      }
    }
    await onSubmit(params)
  }

  const requiredMissing = job.params.some(
    (p) => p.required && !values[p.name]?.trim(),
  )

  return (
    <Modal
      dismissible
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Trigger: ${job.displayName}`}
      description={job.description}
      footer={
        <div className='flex flex-row justify-end gap-2'>
          <Button variant='outline' size='small' onClick={onClose}>
            Cancel
          </Button>
          <Button
            size='small'
            onClick={handleSubmit}
            disabled={isTriggering || requiredMissing}
          >
            {isTriggering ? 'Triggering...' : 'Trigger'}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-4'>
        {job.params.map((param) => (
          <div key={param.name} className='flex flex-col gap-1'>
            <div className='flex flex-row items-center gap-2'>
              <Text.H5>{param.name}</Text.H5>
              {param.required && (
                <Text.H6 color='destructive'>required</Text.H6>
              )}
              <Text.H6 color='foregroundMuted'>({param.type})</Text.H6>
            </div>
            <Text.H6 color='foregroundMuted'>{param.description}</Text.H6>
            <Input
              type={param.type === 'number' ? 'number' : 'text'}
              placeholder={param.name}
              value={values[param.name] ?? ''}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [param.name]: e.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>
    </Modal>
  )
}
