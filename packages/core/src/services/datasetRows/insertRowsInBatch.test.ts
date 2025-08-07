import { beforeAll, describe, expect, it } from 'vitest'
import { Dataset, User, Workspace } from '../../browser'
import { DatasetRowsRepository } from '../../repositories'
import { DatasetRowData } from '../../schema'
import * as factories from '../../tests/factories'
import { insertRowsInBatch } from './insertRowsInBatch'

let workspace: Workspace
let author: User
let dataset: Dataset

describe('insertRowsInBatch', () => {
  beforeAll(async () => {
    const data = await factories.createWorkspace()
    workspace = data.workspace
    author = data.userData
    const datasetResult = await factories.createDataset({ workspace, author })
    dataset = datasetResult.dataset
  })

  it('should return ok with an empty array when no rows are provided', async () => {
    const result = await insertRowsInBatch({
      dataset,
      data: { rows: [] },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual([])
    }
  })

  it('should insert rows in batch and return the inserted rows', async () => {
    const rowData: DatasetRowData[] = [
      { col_a: 'value1', col_b: 10 },
      { col_a: 'value2', col_b: 20 },
    ]

    const result = await insertRowsInBatch({
      dataset,
      data: { rows: rowData },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const insertedRows = result.unwrap()

      expect(insertedRows).toHaveLength(2)
      expect(insertedRows[0]).toEqual(
        expect.objectContaining({
          workspaceId: dataset.workspaceId,
          datasetId: dataset.id,
          rowData: { col_a: 'value1', col_b: 10 },
        }),
      )
      expect(insertedRows[1]).toEqual(
        expect.objectContaining({
          workspaceId: dataset.workspaceId,
          datasetId: dataset.id,
          rowData: { col_a: 'value2', col_b: 20 },
        }),
      )

      // Verify rows in the database
      const repo = new DatasetRowsRepository(workspace.id)
      const dbRows = await repo.findByDatasetPaginated({
        datasetId: dataset.id,
        page: '1',
        pageSize: '10',
      })

      // Filter out rows potentially created by the factory
      const testRows = dbRows.filter((dbRow) =>
        insertedRows.some((insertedRow) => insertedRow.id === dbRow.id),
      )

      expect(testRows).toHaveLength(2)
      expect(testRows.map((r) => r.rowData)).toEqual(
        expect.arrayContaining(rowData),
      )
    }
  })

  it('should associate rows with the correct workspace and dataset', async () => {
    const rowData: DatasetRowData[] = [{ other_col: true }]

    const result = await insertRowsInBatch({
      dataset,
      data: { rows: rowData },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const insertedRows = result.unwrap()

      expect(insertedRows).toHaveLength(1)
      expect(insertedRows[0]!.workspaceId).toBe(dataset.workspaceId)
      expect(insertedRows[0]!.datasetId).toBe(dataset.id)
    }
  })
})
