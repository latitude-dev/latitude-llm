import { DatasetRow, Dataset, parseRowCell } from '@latitude-data/core/browser'
import { DatasetRowData } from '@latitude-data/core/schema'

export type ClientDatasetRow = DatasetRow & {
  cells: DatasetRowData[keyof DatasetRowData][]
  processedRowData: { [key: string]: string }
}

export function serializeRow({
  row,
  columns,
}: {
  row: DatasetRow
  columns: Dataset['columns']
}): ClientDatasetRow {
  return {
    ...row,
    // DEPRECATED: We don't need this. Remove once
    // DataGrid is used without feature flag.
    cells: columns.map(({ identifier }) => {
      const cell = row.rowData[identifier]
      return parseRowCell({ cell, parseDates: true })
    }),
    processedRowData: Object.keys(row.rowData).reduce(
      (acc, key) => {
        const rawCell = row.rowData[key]
        const cell = parseRowCell({ cell: rawCell, parseDates: true })
        return { ...acc, [key]: cell }
      },
      {} as ClientDatasetRow['processedRowData'],
    ),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

export const serializeRows =
  (columns: Dataset['columns']) =>
  (rows: DatasetRow[]): ClientDatasetRow[] => {
    return rows.map((item) => serializeRow({ row: item, columns }))
  }
