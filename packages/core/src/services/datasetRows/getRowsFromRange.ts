import { DatasetRow, DatasetV2 } from '../../browser'
import { DatasetRowsRepository } from '../../repositories'

async function getToLine({
  toLine,
  dataset,
  repo,
}: {
  dataset: DatasetV2
  repo: DatasetRowsRepository
  toLine: number | undefined
}) {
  if (toLine !== undefined) return toLine

  return repo.getCountByDataset(dataset.id)
}

function extractValue(
  value: DatasetRow['rowData'][keyof DatasetRow['rowData']],
) {
  if (value === null || value === undefined) return ''

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function extractValues(row: DatasetRow) {
  return Object.values(row.rowData).map(extractValue)
}

export async function getRowsFromRange({
  dataset,
  fromLine,
  toLine: to,
}: {
  dataset: DatasetV2
  fromLine: number
  toLine?: number
}) {
  const repo = new DatasetRowsRepository(dataset.workspaceId)
  const toLine = await getToLine({ toLine: to, dataset, repo })

  const limit = toLine - fromLine + 1 // ensure we include the last line
  const offset = fromLine - 1 // fromLine is 1-based but offset is 0-based
  const data = await repo.findByDatasetWithOffsetAndLimit({
    datasetId: dataset.id,
    offset,
    limit,
  })

  return { rows: data.map(extractValues) }
}
