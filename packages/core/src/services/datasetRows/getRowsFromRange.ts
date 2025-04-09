import { DatasetRow, Dataset } from '../../browser'
import { DatasetRowsRepository } from '../../repositories'
import { DatasetRowDataContent } from '../../schema'

async function getToLine({
  toLine,
  dataset,
  repo,
}: {
  dataset: Dataset
  repo: DatasetRowsRepository
  toLine: number | undefined
}) {
  if (toLine !== undefined) return toLine

  const result = await repo.getCountByDataset(dataset.id)
  return !result[0] ? 0 : result[0].count
}

function extractValues(row: DatasetRow) {
  const values: Record<string, DatasetRowDataContent> = {}

  for (const [id, value] of Object.entries(row.rowData)) {
    values[id] = value
  }

  return { id: row.id, values }
}

export async function getRowsFromRange({
  dataset,
  fromLine,
  toLine: to,
}: {
  dataset: Dataset
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
