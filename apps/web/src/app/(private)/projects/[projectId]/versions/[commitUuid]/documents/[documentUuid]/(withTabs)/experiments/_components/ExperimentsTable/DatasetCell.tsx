'use client'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useMemo } from 'react'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

export function DatasetCell({
  isLoading,
  datasets,
  datasetId,
}: {
  isLoading: boolean
  datasets?: Dataset[]
  datasetId?: number
}) {
  const dataset = useMemo(() => {
    if (isLoading) return undefined
    if (!datasets) return undefined
    return datasets.find((dataset) => dataset.id === datasetId)
  }, [isLoading, datasets, datasetId])

  if (isLoading) {
    return <Skeleton height='h5' className='w-12' />
  }

  return (
    <Badge variant='secondary' ellipsis noWrap>
      {!datasetId ? 'No dataset' : !dataset ? 'Unknown dataset' : dataset.name}
    </Badge>
  )
}
