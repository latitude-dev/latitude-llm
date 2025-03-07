import { Dataset, DatasetV2, DatasetVersion } from '@latitude-data/core/browser'
import useDatasets from '$/stores/datasets'
import useDatasetsV2 from '$/stores/datasetsV2'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'
import useDatasetPreview from '$/stores/datasetPreviews'
import useDatasetRows from '$/stores/datasetRows'
import { useCallback, useMemo, useState } from 'react'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import {
  useDatasetRowWithPosition,
  type WithPositionData,
} from './useDatasetRowsWithPosition'

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
  const { data: hasDatasetsV2, isLoading } = useFeatureFlag()
  const { data: datasetsV1, isLoading: isLoadingDatasetsV1 } = useDatasets({
    enabled: enabled && !isLoading && !hasDatasetsV2,
    onFetched: (datasets) => {
      onFetched?.(datasets, DatasetVersion.V1)
    },
  })
  const { data: datasetsV2, isLoading: isLoadingDatasetsV2 } = useDatasetsV2({
    enabled: enabled && !isLoading && hasDatasetsV2,
    onFetched: (datasets) => {
      onFetched?.(datasets, DatasetVersion.V2)
    },
    pageSize: '100000', // Big enough page to avoid pagination
  })

  return {
    data: hasDatasetsV2 ? datasetsV2 : datasetsV1,
    datasetVersion: hasDatasetsV2 ? DatasetVersion.V2 : DatasetVersion.V1,
    isLoading: isLoading || isLoadingDatasetsV1 || isLoadingDatasetsV2,
  }
}

/**
 * This hook is responsible of fetching the dataset rows and the
 * total amount of dataset rows for a dataset (v2).
 * This way we can paginate in document parameters all the rows
 */
export function useVersionDatasetRows({
  dataset,
  enabled = true,
  selectedDatasetRowId,
}: {
  dataset: Dataset | DatasetV2 | null | undefined
  enabled?: boolean
  selectedDatasetRowId?: string
}) {
  const isV1 = dataset && 'fileMetadata' in dataset
  const isV2 = dataset && 'columns' in dataset

  // DEPRECATED: Legacy dataset v1. Remove
  const { data: csv, isLoading: isLoadingCsv } = useDatasetPreview({
    dataset: enabled && isV1 ? dataset : undefined,
  })

  const headers = useMemo(() => buildColumnList(dataset), [dataset])
  const { data: count, isLoading: isLoadingDatasetRowsCount } =
    useDatasetRowsCount({
      dataset: enabled && isV2 ? (dataset as DatasetV2) : undefined,
    })

  const [position, setPosition] = useState<WithPositionData | undefined>(
    selectedDatasetRowId ? undefined : { position: 1, page: 1 },
  )

  const onFetchPosition = useCallback(
    (data: WithPositionData) => {
      setPosition(data)
    },
    [selectedDatasetRowId],
  )

  const { isLoading: isLoadingPosition } = useDatasetRowWithPosition({
    dataset: enabled && isV2 ? (dataset as DatasetV2) : undefined,
    datasetRowId: selectedDatasetRowId,
    onFetched: onFetchPosition,
  })

  const { isLoading: isLoadingRow } = useDatasetRows({
    dataset:
      position === undefined
        ? undefined
        : enabled && isV2
          ? (dataset as DatasetV2)
          : undefined,
    page: position === undefined ? undefined : String(position.position),
    pageSize: '1', // Paginatinate one by one in document parameters
    onFetched: (rows) => {
      const row = rows[0]
      if (!row) return

      // Check history hook
      // Map dataset row to parameter inputs. This is only V2
      // set Selected datasetRow id
    },
  })

  const updatePosition = useCallback(
    (position: number) => {
      if (isLoadingRow) return

      setPosition((prev) =>
        prev ? { ...prev, position } : { position, page: 1 },
      )
    },
    [isLoadingRow],
  )

  const onNextPage = useCallback(
    (position: number) => updatePosition(position + 1),
    [updatePosition],
  )

  const onPrevPage = useCallback(
    (position: number) => updatePosition(position - 1),
    [updatePosition],
  )

  return {
    // REMOVE: Legacy dataset v1
    legacyDataset: {
      csv,
      isLoadingCsv,
    },
    isLoading:
      isLoadingCsv || // DEPRECATED: Legacy dataset v1. Remove
      isLoadingRow ||
      isLoadingDatasetRowsCount ||
      isLoadingPosition,
    headers,
    position,
    count: count ?? 0,
    onNextPage,
    onPrevPage,
  }
}
