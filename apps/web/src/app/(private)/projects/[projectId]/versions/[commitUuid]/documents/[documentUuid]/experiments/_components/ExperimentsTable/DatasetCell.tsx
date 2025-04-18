'use client'

import { Dataset } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useMemo } from 'react'

export function DatasetCell({
  isLoading,
  datasets,
  datasetId,
}: {
  isLoading: boolean
  datasets?: Dataset[]
  datasetId: number
}) {
  const dataset = useMemo(() => {
    if (isLoading) return undefined
    if (!datasets) return undefined
    return datasets.find((dataset) => dataset.id === datasetId)
  }, [isLoading, datasets, datasetId])

  if (isLoading) {
    return <Skeleton height='h5' className='w-12' />
  }

  if (!dataset) {
    return (
      <Badge variant='secondary' className='mr-1'>
        Unknown dataset
      </Badge>
    )
  }

  return (
    <Badge variant='secondary' className='mr-1'>
      {dataset.name}
    </Badge>
  )
}
