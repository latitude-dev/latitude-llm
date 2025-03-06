import { Dataset, DatasetV2, DatasetVersion } from '@latitude-data/core/browser'
import useDatasets from '$/stores/datasets'
import useDatasetsV2 from '$/stores/datasetsV2'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'

export function buildColumnList(dataset: Dataset | DatasetV2 | null) {
  if (!dataset) return []

  return 'fileMetadata' in dataset
    ? dataset.fileMetadata.headers
    : 'columns' in dataset
      ? dataset.columns.map((c) => c.name)
      : []
}

export function getColumnIndex(columns: string[], header: string) {
  return columns.indexOf?.(header) !== -1 ? columns.indexOf(header) : undefined
}

export function getDatasetCount(
  dataset: Dataset | DatasetV2 | null,
  datasetRowsCount: number | undefined,
) {
  return dataset
    ? 'fileMetadata' in dataset
      ? dataset.fileMetadata.rowCount
      : datasetRowsCount
    : undefined
}

/**
 * FIXME: Remove this when datasets V2 are open for everyone
 */
export function useVersionedDatasets({
  onFetched,
}: {
  onFetched?: (datasets: (Dataset | DatasetV2)[]) => void
} = {}) {
  const { data: hasDatasetsV2, isLoading } = useFeatureFlag()
  const { data: datasetsV1, isLoading: isLoadingDatasetsV1 } = useDatasets({
    enabled: !isLoading && !hasDatasetsV2,
    onFetched: (datasets) => {
      onFetched?.(datasets)
    },
  })
  const { data: datasetsV2, isLoading: isLoadingDatasetsV2 } = useDatasetsV2({
    enabled: !isLoading && hasDatasetsV2,
    onFetched: (datasets) => {
      onFetched?.(datasets)
    },
    pageSize: '100000', // Big enough page to avoid pagination
  })

  return {
    data: hasDatasetsV2 ? datasetsV2 : datasetsV1,
    datasetVersion: hasDatasetsV2 ? DatasetVersion.V2 : DatasetVersion.V1,
    isLoading: isLoading || isLoadingDatasetsV1 || isLoadingDatasetsV2,
  }
}
