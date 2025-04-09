import { Result, TypedResult } from '../../lib'
import { Column, DatasetRowDataContent } from '../../schema'
import {
  buildColumns,
  HashAlgorithmFn,
  nanoidHashAlgorithm,
} from '../datasets/utils'
import { parseRowCell } from './utils'

type JsonRow = Record<string, unknown>

function parseStringRows(json: string): TypedResult<JsonRow[], Error> {
  try {
    const rows = JSON.parse(json)
    if (!Array.isArray(rows)) {
      return Result.error(
        new Error('Invalid JSON format it has to be an array'),
      )
    }

    return Result.ok(rows)
  } catch {
    return Result.error(new Error('Invalid generated data'))
  }
}

export function extractHeadersFromFirstRow({
  json,
  hashAlgorithm,
}: {
  json: string
  hashAlgorithm: HashAlgorithmFn
}): TypedResult<{ columns: Column[]; rows: JsonRow[] }, Error> {
  const result = parseStringRows(json)
  if (result.error) return result

  const rows = result.value
  const row = rows[0]

  if (!row) return Result.ok({ columns: [], rows: [] })

  const headerNames = Object.keys(row)
  const newColumns = headerNames.map((name) => ({
    name,
  }))

  const columns = buildColumns({ newColumns, prevColumns: [], hashAlgorithm })
  return Result.ok({ columns, rows })
}

export function generatePreviewRowsFromJson({
  rows: json,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  rows: string
  hashAlgorithm?: HashAlgorithmFn
}) {
  const result = extractHeadersFromFirstRow({ json, hashAlgorithm })
  if (result.error) return result

  const { columns, rows } = result.value
  const previewRows = rows.map((row) =>
    columns.map((col) => {
      const cellValue = (row[col.name] as DatasetRowDataContent) ?? ''
      return parseRowCell({
        cell: cellValue,
        parseDates: false,
      })
    }),
  )

  return Result.ok({ headers: columns, rows: previewRows })
}
