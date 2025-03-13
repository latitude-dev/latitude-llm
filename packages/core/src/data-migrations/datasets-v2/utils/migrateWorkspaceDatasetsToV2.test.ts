import { eq } from 'drizzle-orm'
import { describe, beforeAll, beforeEach, it, expect } from 'vitest'
import * as factories from '../../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../../tests/factories'
import getTestDisk from '../../../tests/testDrive'
import { createTestCsvFile } from '../../../services/datasetRows/testHelper'
import { Dataset, LinkedDatasetRow } from '../../../browser'
import { database } from '../../../client'
import { datasetRows, datasetsV2 } from '../../../schema'

import { migrateWorkspaceDatasetsToV2 } from './migrateWorkspaceDatasetsToV2'

let setup: FactoryCreateProjectReturn
let dataset: Dataset
const disk = getTestDisk()

describe('migrateWorkspaceDatasetsToV2', () => {
  beforeAll(async () => {
    setup = await factories.createProject()
    const datasetAuthorUser = await factories.createUser()
    await factories.createMembership({
      user: datasetAuthorUser,
      workspace: setup.workspace,
      author: setup.user,
    })
  })

  describe('dataset without file', () => {
    beforeEach(async () => {
      const { file } = await createTestCsvFile()
      dataset = await factories
        .createDataset({
          workspace: setup.workspace,
          name: 'Test Dataset without file',
          author: setup.user,
          disk,
          file,
        })
        .then((result) => result.dataset)

      // But now we simulate file deletion
      await disk.delete(dataset.fileKey)
    })

    it('handle error when file is not found', async () => {
      const result = await migrateWorkspaceDatasetsToV2({
        workspace: setup.workspace,
        disk,
      })
      expect(result).toEqual({
        workspaceId: setup.workspace.id,
        errors: [
          `File does not exist on Dataset V1: ${dataset.id} on Workspace: ${setup.workspace.id}`,
        ],
        migratedDatasets: [
          {
            datasetV1: {
              id: dataset.id,
              name: 'Test Dataset without file',
              rowCount: 9,
            },
            datasetV2: undefined,
          },
        ],
      })
    })
  })

  describe('dataset with file', () => {
    beforeAll(async () => {
      const { file } = await createTestCsvFile()
      dataset = await factories
        .createDataset({
          workspace: setup.workspace,
          name: 'Test Dataset',
          author: setup.user,
          disk,
          file,
        })
        .then((result) => result.dataset)
    })

    it('should migrate existing workspace datasets to v2', async () => {
      const result = await migrateWorkspaceDatasetsToV2({
        workspace: setup.workspace,
        disk,
      })

      expect(result).toEqual({
        workspaceId: setup.workspace.id,
        errors: [],
        migratedDatasets: [
          {
            datasetV1: { id: dataset.id, name: 'Test Dataset', rowCount: 9 },
            datasetV2: {
              id: expect.any(Number),
              name: 'Test Dataset',
              // It's one less because last row is invalid and is not migrated
              // check `createTestCsvFile` to see input CSV data
              rowCount: 8,
              documents: [],
            },
          },
        ],
      })
    })

    it('should not delete the original dataset V1 file', async () => {
      await migrateWorkspaceDatasetsToV2({
        workspace: setup.workspace,
        disk,
      })
      const fileDisk = disk.file(dataset.fileKey)
      const fileExists = await fileDisk.exists()
      expect(fileExists).toBeTruthy()
    })

    it('should migrated projects with dataset referenced', async () => {
      const datatasetLinkedMeta = {
        [dataset.id]: {
          inputs: {
            name: {
              value: 'François',
              metadata: {
                includeInPrompt: true,
              },
            },
            surname: {
              value: 'Merlo',
              metadata: {
                includeInPrompt: true,
              },
            },
            age: {
              value: 'French',
              metadata: {
                includeInPrompt: true,
              },
            },
          },
          mappedInputs: {
            name: 0,
            surname: 1,
            nationality: 3,
          },
          rowIndex: 2,
        },
      }
      const draft = await factories.createCommit({
        projectId: setup.project.id,
        user: setup.user,
      })
      const { documentVersion } = await factories.createDocumentVersion({
        workspace: setup.workspace,
        user: setup.user,
        commit: draft,
        path: 'patata/doc1',
        content: 'Hello world',
        datasetV1: {
          dataset,
          linkedDataset: datatasetLinkedMeta,
        },
      })

      const result = await migrateWorkspaceDatasetsToV2(
        {
          workspace: setup.workspace,
          disk,
        },
        database,
      )
      const newDataset = await database.query.datasetsV2.findFirst({
        where: eq(datasetsV2.workspaceId, setup.workspace.id),
      })
      const datasetV2 = newDataset!
      const mappedInputs = datasetV2.columns.reduce(
        (acc, column) => {
          if (column.name === 'age') return acc
          acc[column.name] = column.identifier
          return acc
        },
        {} as LinkedDatasetRow['mappedInputs'],
      )
      const rows = await database.query.datasetRows.findMany({
        where: eq(datasetRows.datasetId, datasetV2.id),
      })
      const row = rows[2]!
      expect(result).toEqual({
        workspaceId: setup.workspace.id,
        errors: [],
        migratedDatasets: [
          {
            datasetV1: { id: dataset.id, name: 'Test Dataset', rowCount: 9 },
            datasetV2: {
              id: expect.any(Number),
              name: 'Test Dataset',
              rowCount: 8,
              documents: [
                {
                  documentId: documentVersion.id,
                  datasetV2Id: expect.any(Number),
                  linkedDatasetRow: {
                    [datasetV2.id]: {
                      datasetRowId: row.id,
                      mappedInputs,
                    },
                  },
                },
              ],
            },
          },
        ],
      })
    })
  })
})
