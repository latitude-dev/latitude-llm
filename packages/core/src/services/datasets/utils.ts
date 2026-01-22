import { nanoid } from 'nanoid'

import { DATASET_COLUMN_ROLES, DatasetColumnRole } from '../../constants'
import { type Column } from '../../schema/models/datasets'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DatasetRow } from '../../schema/models/types/DatasetRow'

export type HashAlgorithmFn = (args: { columnName: string }) => string
export type hashAlgorithmArgs = Parameters<HashAlgorithmFn>[0]

export function nanoidHashAlgorithm(_args: hashAlgorithmArgs) {
  return nanoid(7)
}

export function identityHashAlgorithm(args: hashAlgorithmArgs) {
  return `${args.columnName}_identifier`
}

type ColumnArgs = Omit<Column, 'identifier' | 'role'> & {
  role?: DatasetColumnRole
}

const buildColumn =
  (hashAlgorithm: HashAlgorithmFn) =>
  ({
    column,
    existingColumns,
  }: {
    column: ColumnArgs
    existingColumns: Column[]
  }) => {
    const existingColumnIndex = existingColumns.findIndex(
      (col) => col.name === column.name,
    )
    if (existingColumnIndex !== -1) {
      // NOTE: Mutate columns
      const col = existingColumns[existingColumnIndex]!
      existingColumns[existingColumnIndex] = {
        ...col,
        role: column.role ?? DATASET_COLUMN_ROLES.parameter,
      }

      return { column: col, duplicated: true }
    }

    let identifier: string
    let attempts = 0

    do {
      if (attempts >= 6) {
        throw new Error(
          `Failed to generate a unique identifier for column: ${JSON.stringify(column, null, 2)} in columns: ${JSON.stringify(existingColumns, null, 2)}`,
        )
      }

      identifier = hashAlgorithm({ columnName: column.name })
      attempts++
    } while (existingColumns.some((col) => col.identifier === identifier))

    return {
      column: {
        identifier,
        name: column.name,
        role: column.role ?? DATASET_COLUMN_ROLES.parameter,
      },
      duplicated: false,
    }
  }

export function buildColumns({
  newColumns,
  prevColumns,
  hashAlgorithm,
}: {
  newColumns: ColumnArgs[]
  prevColumns: Column[]
  hashAlgorithm: HashAlgorithmFn
}) {
  const builder = buildColumn(hashAlgorithm)
  const columns = [...prevColumns]
  const newColumnNames = new Set(prevColumns.map((col) => col.name))

  newColumns.forEach((col) => {
    const { column, duplicated } = builder({
      column: col,
      existingColumns: columns,
    })

    if (!duplicated) {
      columns.push(column)
    }
  })

  return columns.sort((a, b) => {
    const aIndex = newColumnNames.has(a.name)
      ? prevColumns.findIndex((col) => col.name === a.name)
      : Infinity
    const bIndex = newColumnNames.has(b.name)
      ? prevColumns.findIndex((col) => col.name === b.name)
      : Infinity
    return aIndex - bIndex
  })
}

export function getColumnData({
  dataset,
  row,
  column: columnName,
}: {
  dataset: Dataset
  row: DatasetRow
  column: string
}) {
  const column = dataset.columns.find((c) => c.name === columnName)
  if (!column) {
    throw new Error(`${columnName} column not found in dataset`)
  }

  const data = row.rowData[column.identifier]
  if (data === undefined || data === null) {
    return ''
  }

  if (typeof data === 'string') {
    return data
  }

  try {
    return JSON.stringify(data)
  } catch (error) {
    return String(data)
  }
}
