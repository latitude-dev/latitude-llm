import { DatasetV2, DatasetVersion } from '@latitude-data/core/browser'
import useDatasetsV2 from '$/stores/datasetsV2'

export function buildColumnList(dataset: DatasetV2 | null | undefined) {
  if (!dataset) return []

  return dataset.columns.map((c) => c.name)
}

export function getColumnIndex(columns: string[], header: string) {
  return columns.indexOf?.(header) !== -1 ? columns.indexOf(header) : undefined
}

export function getDatasetCount(
  dataset: DatasetV2 | null,
  datasetRowsCount: number | undefined,
) {
  return dataset ? datasetRowsCount : undefined
}

/**
 * FIXME: Remove this when datasets V2 are open for everyone
 */
export function useVersionedDatasets({
  onFetched,
}: {
  onFetched?: (datasets: DatasetV2[], datasetVersion: DatasetVersion) => void
} = {}) {
  const { data, isLoading } = useDatasetsV2({
    onFetched: (datasets) => {
      onFetched?.(datasets, DatasetVersion.V2)
    },
    pageSize: '100000', // Big enough page to avoid pagination
  })

  return {
    data,
    datasetVersion: DatasetVersion.V2,
    isLoading,
  }
}
