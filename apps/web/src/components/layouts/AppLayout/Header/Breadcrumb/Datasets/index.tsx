import useDatasets from '$/stores/datasetsV2'
import useDatasetsV1 from '$/stores/datasets'
import {
  BreadcrumbItem,
  BreadcrumbItemSkeleton,
  BreadcrumbSeparator,
  Text,
} from '@latitude-data/web-ui'
import { useMemo } from 'react'

export function DatasetBreadcrumbItems({ segments }: { segments: string[] }) {
  const datasetId = Number(segments[0])
  const { data: datasets, isLoading } = useDatasets()
  const dataset = useMemo(
    () => datasets?.find((ds) => ds.id === datasetId),
    [datasets, datasetId],
  )

  return (
    <>
      <BreadcrumbSeparator />
      {isLoading ? (
        <BreadcrumbItemSkeleton />
      ) : (
        <BreadcrumbItem>
          <Text.H4M noWrap ellipsis>
            {dataset?.name || 'Unknown dataset'}
          </Text.H4M>
        </BreadcrumbItem>
      )}
    </>
  )
}

export function DatasetV1BreadcrumbItems({ segments }: { segments: string[] }) {
  const datasetId = Number(segments[0])
  const { data: datasets, isLoading } = useDatasetsV1()
  const dataset = useMemo(
    () => datasets?.find((ds) => ds.id === datasetId),
    [datasets, datasetId],
  )

  return (
    <>
      <BreadcrumbSeparator />
      {isLoading ? (
        <BreadcrumbItemSkeleton />
      ) : (
        <BreadcrumbItem>
          <Text.H4M noWrap ellipsis>
            {dataset?.name || 'Unknown dataset'}
          </Text.H4M>
        </BreadcrumbItem>
      )}
    </>
  )
}
