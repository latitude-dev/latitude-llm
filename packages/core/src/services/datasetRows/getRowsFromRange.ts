import { type DatasetRow } from '../../schema/models/types/DatasetRow'
import { type Dataset } from '../../schema/models/types/Dataset'
import { database } from '../../client'
import { DatasetRowsRepository } from '../../repositories'
import { DatasetRowDataContent } from '../../schema/models/datasetRows'

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

  return repo.getCountByDataset(dataset.id)
}

function extractValues(row: DatasetRow) {
  const values: Record<string, DatasetRowDataContent> = {}

  for (const [id, value] of Object.entries(row.rowData)) {
    values[id] = value
  }

  return { id: row.id, values }
}

export async function getRowsFromRange(
  {
    dataset,
    fromLine,
    toLine: to,
  }: {
    dataset: Dataset
    fromLine: number
    toLine?: number
  },
  db = database,
) {
  const repo = new DatasetRowsRepository(dataset.workspaceId, db)
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
