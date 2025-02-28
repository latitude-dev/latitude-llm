import { beforeAll, expect, describe, it, vi } from 'vitest'
import getTestDisk from '../../tests/testDrive'
import { createDataset } from '../datasetsV2/create'
import * as factories from '../../tests/factories'
import { DatasetV2, User, Workspace } from '../../browser'
import { createRowsFromUploadedDataset } from './createRowsFromUploadedDataset'
import { DatasetV2CreatedEvent } from '../../events/events'
import { DatasetRowsRepository } from '../../repositories'
import { createTestCsvFile } from './testHelper'

const testDrive = getTestDisk()

let workspace: Workspace
let author: User
let dataset: DatasetV2
let fileKey: string

describe('createRowsFromUploadedDataset', () => {
  beforeAll(async () => {
    vi.resetModules()
    const data = await factories.createWorkspace()
    workspace = data.workspace
    author = data.userData

    const { file } = await createTestCsvFile()

    const createdDataset = await createDataset({
      author,
      workspace,
      disk: testDrive,
      data: {
        name: 'paco',
        file,
        csvDelimiter: ',',
      },
    }).then((r) => r.unwrap())
    dataset = createdDataset.dataset
    fileKey = createdDataset.fileKey
  })

  it('should create rows from an uploaded dataset', async () => {
    const event = {
      type: 'datasetUploaded' as DatasetV2CreatedEvent['type'],
      data: {
        workspaceId: workspace.id,
        datasetId: dataset.id,
        userEmail: author.email,
        csvDelimiter: ',',
        fileKey,
      },
    }
    const onRowsCreatedMock = vi.fn()
    const onFinishedMock = vi.fn()
    await createRowsFromUploadedDataset({
      event,
      onRowsCreated: onRowsCreatedMock,
      onFinished: onFinishedMock,
      batchSize: 2,
      disk: testDrive,
    })
    const repo = new DatasetRowsRepository(workspace.id)
    const rows = await repo.findByDatasetPaginated({
      datasetId: dataset.id,
      page: '1',
      pageSize: '100',
    })

    const row = rows[0]
    expect(row).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        workspaceId: workspace.id,
        datasetId: dataset.id,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
    const columns = dataset.columns
    const name = columns[0]!.identifier
    const surname = columns[1]!.identifier
    const age = columns[2]!.identifier
    const nationality = columns[3]!.identifier
    const rowData = rows.map((r) => r.rowData)

    expect(onFinishedMock).toHaveBeenCalled()
    expect(rowData).toEqual([
      {
        [name]: 'Paco',
        [surname]: 'Merlo',
        [age]: '43',
        [nationality]: 'Spanish',
      },
      {
        [name]: 'Frank',
        [surname]: 'Merlo',
        [age]: '11',
        [nationality]: 'North American',
      },
      {
        [name]: 'François',
        [surname]: 'Merlo',
        [age]: '84',
        [nationality]: 'French',
      },
      {
        [name]: 'Francesco',
        [surname]: 'Merlo',
        [age]: '19',
        [nationality]: 'Italian',
      },
      {
        [name]: 'Francisco',
        [surname]: 'Merlo',
        [age]: '9',
        [nationality]: 'Portuguese',
      },
      {
        [name]: 'Frančišek',
        [surname]: 'Merlo',
        [age]: '89',
        [nationality]: 'Slovenian',
      },
      {
        [name]: 'Francis',
        [surname]: 'Merlo',
        [age]: '23',
        [nationality]: 'British',
      },
      {
        [name]: 'Franz',
        [surname]: 'Merlo',
        [age]: '48',
        [nationality]: 'German',
      },
    ])
  })
})
