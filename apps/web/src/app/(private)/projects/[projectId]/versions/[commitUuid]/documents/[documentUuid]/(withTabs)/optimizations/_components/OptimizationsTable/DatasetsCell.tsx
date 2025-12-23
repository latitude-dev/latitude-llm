'use client'

import { ROUTES } from '$/services/routes'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Link from 'next/link'
import { OptimizationStatus } from './shared'

function DatasetBadge({
  label,
  dataset,
  status,
  hasPreparedAt,
  hasError,
}: {
  label: string
  dataset?: Dataset
  status: OptimizationStatus
  hasPreparedAt: boolean
  hasError: boolean
}) {
  if (dataset) {
    const href = ROUTES.datasets.detail(dataset.id)

    return (
      <Link href={href} target='_blank' onClick={(e) => e.stopPropagation()}>
        <Badge variant='outlineMuted'>
          <div className='flex flex-row gap-1 items-center'>
            <Text.H6
              color={hasError ? 'destructive' : 'foreground'}
              userSelect={false}
            >
              {label}
            </Text.H6>
            <Icon name='externalLink' size='small' className='shrink-0' />
          </div>
        </Badge>
      </Link>
    )
  }

  if (hasPreparedAt) {
    return (
      <Tooltip
        asChild
        trigger={
          <Badge variant='outlineMuted' disabled>
            <Text.H6
              color={hasError ? 'destructive' : 'foregroundMuted'}
              userSelect={false}
            >
              {label}
            </Text.H6>
          </Badge>
        }
        align='center'
        side='top'
        delayDuration={750}
      >
        {label} was deleted
      </Tooltip>
    )
  }

  if (status === 'preparing') {
    return <Skeleton height='h3' className='w-18 rounded-md' />
  }

  return (
    <Text.H5
      color={hasError ? 'destructive' : 'foregroundMuted'}
      userSelect={false}
    >
      -
    </Text.H5>
  )
}

export function DatasetsCell({
  trainset,
  testset,
  status,
  hasPreparedAt,
  hasError,
}: {
  trainset?: Dataset
  testset?: Dataset
  status: OptimizationStatus
  hasPreparedAt: boolean
  hasError: boolean
}) {
  if (!trainset && !testset && !hasPreparedAt) {
    if (status === 'preparing') {
      return <Skeleton height='h3' className='w-36 rounded-md' />
    }

    return (
      <Text.H5
        color={hasError ? 'destructive' : 'foregroundMuted'}
        userSelect={false}
      >
        -
      </Text.H5>
    )
  }

  return (
    <div className='flex flex-row gap-2 items-center'>
      <DatasetBadge
        label='Trainset'
        dataset={trainset}
        status={status}
        hasPreparedAt={hasPreparedAt}
        hasError={hasError}
      />
      <DatasetBadge
        label='Testset'
        dataset={testset}
        status={status}
        hasPreparedAt={hasPreparedAt}
        hasError={hasError}
      />
    </div>
  )
}
