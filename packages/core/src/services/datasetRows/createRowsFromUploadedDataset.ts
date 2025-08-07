import type { Dataset, DatasetRow } from '../../browser'
import type { DatasetV2CreatedEvent } from '../../events/events'
import { diskFactory, type DiskWrapper } from '../../lib/disk'
import { csvBatchGenerator, type CSVRow, type CsvBatch } from '../../lib/readCsv'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetsRepository } from '../../repositories'
import type { Column, DatasetRowData } from '../../schema'
import { updateDataset } from '../datasets/update'
import { buildColumns, type HashAlgorithmFn, nanoidHashAlgorithm } from '../datasets/utils'
import { insertRowsInBatch } from './insertRowsInBatch'

function reorderRowsByColumns({ columns, row }: { columns: Column[]; row: CSVRow }): string[] {
  const keys = Object.keys(row.record)
  const columnOrderMap = new Map(columns.map((col, index) => [col.name, index]))

  return keys.sort((a, b) => {
    return (columnOrderMap.get(a) ?? -Infinity) - (columnOrderMap.get(b) ?? -Infinity)
  })
}

function parseRow({ columns, row }: { columns: Column[]; row: CSVRow }) {
  const keys = reorderRowsByColumns({ columns, row })
  const rowData = keys.reduce((acc, cell) => {
    const column = columns.find((c) => c.name === cell)
    if (!column) return acc

    const cellData = row.record[cell] ?? ''
    acc[column.identifier] = cellData
    return acc
  }, {} as DatasetRowData)

  return rowData
}

function parseBatch({ columns, batch }: { columns: Column[]; batch: CsvBatch }) {
  return batch.reduce((acc, row) => {
    const parsedRow = parseRow({ columns, row })

    acc.push(parsedRow)
    return acc
  }, [] as DatasetRowData[])
}

type CsvColum = { name: string }
async function updateDatasetColumnsWithCsv({
  dataset,
  csvColumns,
  hashAlgorithm,
}: {
  dataset: Dataset
  csvColumns: CsvColum[]
  hashAlgorithm: HashAlgorithmFn
}) {
  const newColumns = csvColumns.map((c) => ({ name: c.name }))
  const columns = buildColumns({
    hashAlgorithm,
    newColumns,
    prevColumns: dataset.columns,
  })

  await updateDataset({ dataset, data: { columns } })

  return Result.ok(columns)
}

export async function createRowsFromUploadedDataset(
  {
    event,
    onRowsCreated,
    onFinished,
    onError,
    deleteFile = true,
    disk = diskFactory(),
    batchSize = 200, // 200 rows per batch
    hashAlgorithm = nanoidHashAlgorithm,
  }: {
    event: DatasetV2CreatedEvent
    onError?: (error: Error) => void
    onRowsCreated?: (args: { dataset: Dataset; rows: DatasetRow[] }) => void
    onFinished?: () => void
    disk?: DiskWrapper
    deleteFile?: boolean
    batchSize?: number
    hashAlgorithm?: HashAlgorithmFn
  },
  transaction = new Transaction(),
) {
  const { workspaceId, datasetId, fileKey, csvDelimiter } = event.data
  const repo = new DatasetsRepository(workspaceId)
  const datasetResult = await repo.find(datasetId)

  if (datasetResult.error) {
    onError?.(new Error('Dataset not found'))
    return Result.error(datasetResult.error)
  }

  const dataset = datasetResult.value

  const file = disk.file(fileKey)
  const stream = await file.getStream()
  let columns = dataset.columns
  let index = 0
  let rowCount = 0

  for await (const batch of csvBatchGenerator({
    stream,
    delimiter: csvDelimiter,
    batchSize,
  })) {
    if (batch === null) {
      onFinished?.()

      if (!deleteFile) break

      const deleteResult = await disk.delete(fileKey)

      if (deleteResult.error) {
        throw new Error(
          `Error deleting file: ${deleteResult.error.message} datasetId: ${datasetId} workspaceId: ${workspaceId}`,
        )
      }
      break
    }

    // Before storing the first batch we need to update the columns
    if (index === 0) {
      const firstBatchItem = batch[0]

      if (!firstBatchItem) {
        throw new Error('CSV group of rows is empty')
      }

      // NOTE: Columns can have other shape coming from `csv-parser`. But because
      // we request csvs with columns we assume this shape
      const csvColumns = firstBatchItem.info.columns as CsvColum[]
      columns = await updateDatasetColumnsWithCsv({
        dataset,
        csvColumns,
        hashAlgorithm,
      }).then((r) => r.unwrap())
    }

    const rows = parseBatch({ columns, batch })
    rowCount += rows.length
    const insertResult = await insertRowsInBatch({ dataset, data: { rows } }, transaction)

    if (insertResult.error) {
      onError?.(insertResult.error)
      return Result.error(insertResult.error)
    } else {
      onRowsCreated?.({ dataset, rows: insertResult.value })
    }

    index++
  }

  return Result.ok({ dataset, rowCount })
}
