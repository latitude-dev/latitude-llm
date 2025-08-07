import { BreadcrumbItem, BreadcrumbSeparator } from '@latitude-data/web-ui/molecules/Breadcrumb'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BreadcrumbItemSkeleton } from '@latitude-data/web-ui/molecules/Breadcrumb'
import { useDataset } from '$/stores/dataset'

export function DatasetBreadcrumbItems({ segments }: { segments: string[] }) {
  const datasetId = Number(segments[0])
  const { data: dataset, isLoading } = useDataset(datasetId)

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
