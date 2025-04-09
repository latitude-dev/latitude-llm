import { useMemo } from 'react'
import {
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui/molecules/Breadcrumb'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BreadcrumbItemSkeleton } from '@latitude-data/web-ui/molecules/Breadcrumb'
import useDatasets from '$/stores/datasets'

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
