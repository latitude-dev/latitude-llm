import { Dataset, User, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { HashAlgorithmFn, nanoidHashAlgorithm } from './utils'
import { createDataset } from './create'
import { extractHeadersFromFirstRow } from '../datasetRows/generatePreviewRowsFromJson'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'
import { Column, DatasetRowData } from '../../schema'

function generateRowsFromJson({
  columns,
  rows,
}: {
  columns: Column[]
  rows: Record<string, unknown>[]
}) {
  return rows.map((row) =>
    columns.reduce((acc, col) => {
      const cellValue = row[col.name] ?? ''
      acc[col.identifier] = cellValue
      return acc
    }, {} as DatasetRowData),
  )
}

export const createDatasetFromJson = async (
  {
    author,
    workspace,
    data,
    hashAlgorithm = nanoidHashAlgorithm,
  }: {
    author: User
    workspace: Workspace
    data: { name: string; rows: string }
    hashAlgorithm?: HashAlgorithmFn
  },
  db = database,
) => {
  const result = extractHeadersFromFirstRow({ json: data.rows, hashAlgorithm })
  if (result.error) return result

  const { columns, rows } = result.value

  return await Transaction.call<Dataset>(async (trx) => {
    const dataset = await createDataset(
      {
        author,
        workspace,
        data: { name: data.name, columns },
      },
      trx,
    ).then((r) => r.unwrap())

    await insertRowsInBatch(
      {
        dataset,
        data: {
          rows: generateRowsFromJson({
            columns,
            rows,
          }),
        },
      },
      trx,
    ).then((r) => r.unwrap())

    return Result.ok(dataset)
  }, db)
}
