import type { User, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import type { Column, DatasetRowData } from '../../schema'
import { extractHeadersFromFirstRow } from '../datasetRows/generatePreviewRowsFromJson'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'
import { createDataset } from './create'
import { type HashAlgorithmFn, nanoidHashAlgorithm } from './utils'

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
  transaction = new Transaction(),
) => {
  const result = extractHeadersFromFirstRow({ json: data.rows, hashAlgorithm })
  if (result.error) return result

  const { columns, rows } = result.value

  const dataset = await createDataset(
    {
      author,
      workspace,
      data: { name: data.name, columns },
    },
    transaction,
  )
  if (dataset.error) return dataset

  const row = await insertRowsInBatch(
    {
      dataset: dataset.value,
      data: {
        rows: generateRowsFromJson({
          columns,
          rows,
        }),
      },
    },
    transaction,
  )
  if (row.error) return row

  return Result.ok(dataset.value)
}
