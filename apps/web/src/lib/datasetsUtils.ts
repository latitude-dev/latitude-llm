import { Dataset } from '@latitude-data/core/schema/types'

export function buildColumnList(dataset: Dataset | null | undefined) {
  if (!dataset) return []

  return dataset.columns.map((c) => c.name)
}

export function getColumnIndex(columns: string[], header: string) {
  return columns.indexOf?.(header) !== -1 ? columns.indexOf(header) : undefined
}

export function getDatasetCount(
  dataset: Dataset | null,
  datasetRowsCount: number | undefined,
) {
  return dataset ? datasetRowsCount : undefined
}
