import { useDataset } from '$/stores/dataset'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  BreadcrumbItem,
  BreadcrumbItemSkeleton,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui/molecules/Breadcrumb'

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
