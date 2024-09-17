import { Dataset } from '../../browser'
import { Result } from '../../lib'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { syncReadCsv } from '../../lib/readCsv'

/**
 * This service pick the first N rows of a CSV file
 */
export async function previewDataset({
  dataset,
  disk = diskFactory(),
  prependIndex,
  fromLine = 1,
  toLine = 100,
}: {
  dataset: Dataset
  disk?: DiskWrapper
  prependIndex?: boolean
  fromLine?: number
  toLine?: number
}) {
  const diskFile = disk.file(dataset.fileKey)
  const bytes = await diskFile.getBytes()
  const file = new TextDecoder().decode(bytes)
  const readResult = await syncReadCsv(file, {
    fromLine,
    toLine,
    delimiter: dataset.csvDelimiter,
  })
  if (readResult.error) readResult

  const csv = readResult.value!
  const rows = csv.data.map((row, i) => {
    const values = Object.values(row.record)
    if (!prependIndex) return values

    values.unshift(String(i + 1))
    return values
  })
  return Result.ok({
    rowCount: csv.rowCount,
    headers: csv.headers,
    rows,
  })
}
