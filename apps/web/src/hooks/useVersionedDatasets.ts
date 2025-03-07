import { Dataset, DatasetV2, DatasetVersion } from '@latitude-data/core/browser'
import useDatasets from '$/stores/datasets'
import useDatasetsV2 from '$/stores/datasetsV2'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'
import { CsvParsedData } from '@latitude-data/core/lib/readCsv'
import useDatasetPreview from '$/stores/datasetPreviews'
import useDatasetRows from '$/stores/datasetRows'
import { useMemo, useState } from 'react'

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
  onFetched?: (datasets: (Dataset | DatasetV2)[]) => void
  enabled?: boolean
} = {}) {
  const { data: hasDatasetsV2, isLoading } = useFeatureFlag()
  const { data: datasetsV1, isLoading: isLoadingDatasetsV1 } = useDatasets({
    enabled: enabled && !isLoading && !hasDatasetsV2,
    onFetched: (datasets) => {
      onFetched?.(datasets)
    },
  })
  const { data: datasetsV2, isLoading: isLoadingDatasetsV2 } = useDatasetsV2({
    enabled: enabled && !isLoading && hasDatasetsV2,
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

const EMPTY_ROWS = { headers: [], rows: [], rowCount: 0 }
export function useVersionDatasetRows({
  dataset,
  enabled = true,
  rowIndex = 0, // 0-based index
}: {
  dataset: Dataset | DatasetV2 | null | undefined
  enabled?: boolean
  rowIndex?: number
}) {
  const isV1 = dataset && 'fileMetadata' in dataset
  const isV2 = dataset && 'columns' in dataset
  const { data: csv, isLoading: isLoadingCsv } = useDatasetPreview({
    dataset: enabled && isV1 ? dataset : undefined,
  })
  const headers = useMemo(() => buildColumnList(dataset), [dataset])
  const [rowsData, setRowData] = useState<CsvParsedData>(EMPTY_ROWS)
  const { isLoading: isLoadingDatasetRows } = useDatasetRows({
    dataset: enabled && isV2 ? (dataset as DatasetV2) : undefined,
    withCount: true,
    page: String(rowIndex + 1),
    pageSize: '1',
    onFetched: (data) => {
      setRowData({
        headers,
        rowCount: data.rowCount,
        rows: data.rows.map((r) => r.cells.map((c) => String(c))),
      })
    },
  })

  const data = isV1 ? csv : rowsData || EMPTY_ROWS

  return {
    isLoading: isLoadingCsv || isLoadingDatasetRows,
    data,
  }
}
