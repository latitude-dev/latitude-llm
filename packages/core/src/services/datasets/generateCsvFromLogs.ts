import { stringify } from 'csv-stringify/sync'
import { Result } from '../../lib/Result'
import { Workspace } from '../../schema/types'
import { buildDocumentLogDatasetRows } from '../documentLogs/buildDocumentLogDatasetRows'
import { nanoidHashAlgorithm } from './utils'
import { Column } from '../../schema/models/datasets'
import { DatasetRowData } from '../../schema/models/datasetRows'

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

  if (result.error) return result

  const { columns, rows } = result.value
  const csvResult = stringifyData({ columns, rows })
  if (csvResult.error) return csvResult

  return Result.ok(csvResult.value)
}
