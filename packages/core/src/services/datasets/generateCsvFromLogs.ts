/**
 * NOTE: If memory is a problem exporting the CSV this library have
 * a streaming API that can be used to write the CSV to a file
 * but we need to change the we we do the download in the web api.
 */
import { stringify } from 'csv-stringify/sync'
import { Result } from '../../lib/Result'
import {
  DocumentLogFilterOptions,
  DocumentVersion,
  ExtendedDocumentLogFilterOptions,
  Workspace,
} from '../../browser'
import {
  buildDocumentLogDataset,
  ColumnFilters,
} from '../documentLogs/buildDocumentLogDataset'
import { nanoidHashAlgorithm } from './utils'
import { Column, DatasetRowData } from '../../schema'

function stringifyData({
  columns,
  rows,
}: {
  columns: Column[]
  rows: DatasetRowData[]
}) {
  const headerRow = columns.map((col) => col.name)
  const dataRows = rows.map((row) =>
    columns.map((col) => {
      const value = row[col.identifier]
      return value ?? ''
    }),
  )

  let csvString = ''
  try {
    csvString = stringify([headerRow, ...dataRows])
    return Result.ok(csvString)
  } catch (error) {
    return Result.error(new Error('Error generating CSV from logs'))
  }
}

export const generateCsvFromLogs = async ({
  workspace,
  documentUuid,
  extendedFilterOptions,
  columnFilters,
}: {
  workspace: Workspace
  documentUuid: string
  extendedFilterOptions: ExtendedDocumentLogFilterOptions
  columnFilters?: ColumnFilters
}) => {
  const result = await buildDocumentLogDataset({
    workspace,
    documentUuid,
    extendedFilterOptions,
    columnFilters,
    hashAlgorithm: nanoidHashAlgorithm,
  })

  if (result.error) return result

  const { columns, rows } = result.value
  const csvResult = stringifyData({ columns, rows })
  if (csvResult.error) return csvResult

  return Result.ok(csvResult.value)
}
