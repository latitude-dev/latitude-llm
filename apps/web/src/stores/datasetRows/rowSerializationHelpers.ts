import { DatasetRow, parseRowCell } from '@latitude-data/core/browser'

export type ClientDatasetRow = DatasetRow & {
  processedRowData: { [key: string]: string }
}

export function serializeRow({ row }: { row: DatasetRow }): ClientDatasetRow {
  return {
    ...row,
    processedRowData: Object.keys(row.rowData).reduce(
      (acc, key) => {
        const rawCell = row.rowData[key]
        const cell = parseRowCell({ cell: rawCell })
        return { ...acc, [key]: cell }
      },
      {} as ClientDatasetRow['processedRowData'],
    ),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

export const serializeRows = (rows: DatasetRow[]): ClientDatasetRow[] => {
  return rows.map((item) => serializeRow({ row: item }))
}
