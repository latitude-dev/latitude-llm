import { Dataset, DatasetV2, DatasetVersion } from '@latitude-data/core/browser'
import useDatasets from '$/stores/datasets'
import useDatasetsV2 from '$/stores/datasetsV2'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

export function buildColumnList(
  dataset: Dataset | DatasetV2 | null | undefined,
) {
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
  enabled = true,
}: {
  onFetched?: (
    datasets: (Dataset | DatasetV2)[],
    datasetVersion: DatasetVersion,
  ) => void
  enabled?: boolean
} = {}) {
  const { enabled: hasDatasetsV2 } = useFeatureFlag({
    featureFlag: 'datasetsV2',
  })
  const datasetVersion = hasDatasetsV2 ? DatasetVersion.V2 : DatasetVersion.V1

  const isV1 = datasetVersion === DatasetVersion.V1

  const { data: datasetsV1, isLoading: isLoadingDatasetsV1 } = useDatasets({
    enabled: enabled && isV1,
    onFetched: (datasets) => {
      onFetched?.(datasets, DatasetVersion.V1)
    },
  })

  const { data: datasetsV2, isLoading: isLoadingDatasetsV2 } = useDatasetsV2({
    enabled: enabled && !isV1,
    onFetched: (datasets) => {
      onFetched?.(datasets, DatasetVersion.V2)
    },
    pageSize: '100000', // Big enough page to avoid pagination
  })

  const isLoading = isLoadingDatasetsV1 || isLoadingDatasetsV2

  return {
    data: isV1 ? datasetsV1 : datasetsV2,
    datasetVersion: datasetVersion ?? DatasetVersion.V1,
    isLoading,
  }
}
