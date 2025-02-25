import { DatasetRow, DatasetV2 } from '../../browser'
import { database } from '../../client'
import { DatasetV2CreatedEvent } from '../../events/events'
import { diskFactory, DiskWrapper, Result, Transaction } from '../../lib'
import {
  csvBatchGenerator,
  CSVRow,
  DEFAULT_CSV_BATCH_SIZE,
  type CsvBatch,
} from '../../lib/readCsv'
import { DatasetsV2Repository } from '../../repositories'
import { datasetRows, Column, DatasetRowData } from '../../schema'

type RowAttributes = Pick<DatasetRow, 'datasetId' | 'workspaceId'>
type InsertRow = {
  workspaceId: number
  datasetId: number
  rowData: DatasetRowData
}
function parseRow({
  columns,
  row,
  rowAttributes,
}: {
  columns: Column[]
  row: CSVRow
  rowAttributes: RowAttributes
}) {
  const keys = Object.keys(row.record)
  const rowData = keys.reduce((acc, cell, index) => {
    const column = columns[index]
    if (!column) return acc

    const cellData = row.record[cell] ?? ''
    acc[column.identifier] = cellData
    return acc
  }, {} as DatasetRowData)

  return { ...rowAttributes, rowData }
}

function parseBatch({
  rowAttributes,
  columns,
  batch,
}: {
  rowAttributes: RowAttributes
  columns: Column[]
  batch: CsvBatch
}) {
  return batch.reduce((acc, row) => {
    const parsedRow = parseRow({ rowAttributes, columns, row })
    acc.push(parsedRow)
    return acc
  }, [] as InsertRow[])
}

export async function createRowsFromUploadedDataset(
  {
    event: event,
    onRowsCreated,
    onFinished,
    onError,
    disk = diskFactory(),
    batchSize = DEFAULT_CSV_BATCH_SIZE,
  }: {
    event: DatasetV2CreatedEvent
    onError?: (error: Error) => void
    onRowsCreated?: (args: { dataset: DatasetV2; rows: DatasetRow[] }) => void
    onFinished?: () => void
    disk?: DiskWrapper
    batchSize?: number
  },
  db = database,
) {
  const { workspaceId, datasetId, fileKey, csvDelimiter } = event.data
  const repo = new DatasetsV2Repository(workspaceId)
  const datasetResult = await repo.find(datasetId)

  if (datasetResult.error) {
    onError?.(new Error('Dataset not found'))
    return Result.error(datasetResult.error)
  }

  const dataset = datasetResult.value

  const file = disk.file(fileKey)
  const stream = await file.getStream()
  for await (const batch of csvBatchGenerator({
    stream,
    delimiter: csvDelimiter,
    batchSize,
  })) {
    if (batch === null) {
      onFinished?.()
      const deleteResult = await disk.delete(fileKey)

      if (deleteResult.error) {
        throw new Error(
          `Error deleting file: ${deleteResult.error.message} datasetId: ${datasetId} workspaceId: ${workspaceId}`,
        )
      }
      break
    }

    const insertResult = await Transaction.call<DatasetRow[]>(async (trx) => {
      const rows = parseBatch({
        rowAttributes: { workspaceId, datasetId },
        columns: dataset.columns,
        batch,
      })
      const result = await trx.insert(datasetRows).values(rows).returning()
      return Result.ok(result)
    }, db)

    if (insertResult.error) {
      onError?.(insertResult.error)
      return Result.error(insertResult.error)
    } else {
      onRowsCreated?.({ dataset, rows: insertResult.value })
    }
  }

  return Result.nil()
}
