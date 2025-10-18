import { stringify } from 'csv-stringify/sync'
import { Result } from '../../lib/Result'
import { type Workspace } from '../../schema/models/types/Workspace'
import { buildSpanDatasetRows } from '../tracing/spans/export'
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
  } catch (_error) {
    return Result.error(new Error('Error generating CSV from spans'))
  }
}

export const generateCsvFromSpans = async ({
  workspace,
  data,
}: {
  workspace: Workspace
  data: {
    spanIdentifiers: Array<{ traceId: string; spanId: string }>
  }
}) => {
  const result = await buildSpanDatasetRows({
    workspace,
    spanIdentifiers: data.spanIdentifiers,
    hashAlgorithm: nanoidHashAlgorithm,
  })

  if (result.error) return result

  const { columns, rows } = result.value
  const csvResult = stringifyData({ columns, rows })
  if (csvResult.error) return csvResult

  return Result.ok(csvResult.value)
}
