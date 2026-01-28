'use client'

import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

type UsageData = {
  runs: { used: number; limit: number | 'unlimited' }
  seats: { used: number; limit: number | 'unlimited' }
}

type Props = {
  workspaceId: number
  workspaceName: string
}

export function UsageDetailsButton({ workspaceId, workspaceName }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = async () => {
    setIsOpen(true)
    if (usage) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/admin/workspace-usage?workspaceId=${workspaceId}`,
      )
      if (!response.ok) {
        throw new Error('Failed to fetch usage data')
      }
      const data = await response.json()
      setUsage(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const formatLimit = (limit: number | 'unlimited') => {
    if (limit === 'unlimited') return 'Unlimited'
    return limit.toLocaleString()
  }

  const getPercentage = (used: number, limit: number | 'unlimited') => {
    if (limit === 'unlimited') return 0
    return Math.min((used / limit) * 100, 100)
  }

  return (
    <>
      <Button variant='outline' size='small' fancy onClick={handleOpen}>
        <div className='flex flex-row items-center gap-1'>
          <Icon name='circleGauge' size='small' />
          <Text.H6>Details</Text.H6>
        </div>
      </Button>

      <Modal
        dismissible
        open={isOpen}
        onOpenChange={setIsOpen}
        title={`Usage Details - ${workspaceName}`}
        description='Detailed usage breakdown for this workspace'
      >
        {isLoading ? (
          <div className='flex flex-col items-center justify-center py-8 gap-4'>
            <Icon name='loader' size='large' color='foregroundMuted' />
            <Text.H5 color='foregroundMuted'>Loading usage data...</Text.H5>
          </div>
        ) : error ? (
          <div className='flex flex-col items-center justify-center py-8 gap-2'>
            <Icon name='alert' size='large' color='destructive' />
            <Text.H5 color='destructive'>{error}</Text.H5>
          </div>
        ) : usage ? (
          <div className='flex flex-col gap-6'>
            <UsageBar
              label='Runs'
              icon='logs'
              used={usage.runs.used}
              limit={usage.runs.limit}
              formatLimit={formatLimit}
              getPercentage={getPercentage}
            />
            <UsageBar
              label='Seats'
              icon='users'
              used={usage.seats.used}
              limit={usage.seats.limit}
              formatLimit={formatLimit}
              getPercentage={getPercentage}
            />
          </div>
        ) : null}
      </Modal>
    </>
  )
}

function UsageBar({
  label,
  icon,
  used,
  limit,
  formatLimit,
  getPercentage,
}: {
  label: string
  icon: 'logs' | 'users'
  used: number
  limit: number | 'unlimited'
  formatLimit: (limit: number | 'unlimited') => string
  getPercentage: (used: number, limit: number | 'unlimited') => number
}) {
  const percentage = getPercentage(used, limit)
  const isHighUsage = percentage > 80

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-row items-center gap-2'>
          <Icon name={icon} size='small' color='foregroundMuted' />
          <Text.H5>{label}</Text.H5>
        </div>
        <Text.H5 color={isHighUsage ? 'destructive' : 'foregroundMuted'}>
          {used.toLocaleString()} / {formatLimit(limit)}
        </Text.H5>
      </div>
      {limit !== 'unlimited' && (
        <div className='h-2 bg-muted rounded-full overflow-hidden'>
          <div
            className={`h-full rounded-full transition-all ${
              isHighUsage ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}
