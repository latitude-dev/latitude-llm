import { stringify } from 'csv-stringify/sync'
import { Result } from '../../lib/Result'
import { Workspace } from '../../browser'
import { buildDocumentLogDatasetRows } from '../documentLogs/buildDocumentLogDatasetRows'
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
  data,
}: {
  workspace: Workspace
  data: {
    documentLogIds: number[]
  }
}) => {
  const result = await buildDocumentLogDatasetRows({
    workspace,
    documentLogIds: data.documentLogIds,
    hashAlgorithm: nanoidHashAlgorithm,
  })

  if (!Result.isOk(result)) return result

  const { columns, rows } = result.unwrap()
  const csvResult = stringifyData({ columns, rows })
  if (!Result.isOk(csvResult)) return csvResult

  return Result.ok(csvResult.unwrap())
}
