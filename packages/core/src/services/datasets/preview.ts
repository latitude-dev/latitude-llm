import { Dataset } from '../../browser'
import { Result } from '../../lib'
import { DiskWrapper } from '../../lib/disk'
import { syncReadCsv } from '../../lib/readCsv'

/**
 * This service pick the first N rows of a CSV file
 */
export async function previewDataset({
  dataset,
  disk,
  limit = 100,
}: {
  dataset: Dataset
  disk: DiskWrapper
  limit?: number
}) {
  const diskFile = disk.file(dataset.fileKey)
  const bytes = await diskFile.getBytes()
  const file = new TextDecoder().decode(bytes)
  const readResult = await syncReadCsv(file, {
    limit,
    delimiter: dataset.csvDelimiter,
  })
  if (readResult.error) readResult

  const csv = readResult.value!
  const rows = csv.data.map((row, i) => {
    const values = Object.values(row.record)
    values.unshift(String(i + 1))
    return values
  })
  return Result.ok({
    rowCount: csv.rowCount,
    headers: csv.headers,
    rows,
  })
}
