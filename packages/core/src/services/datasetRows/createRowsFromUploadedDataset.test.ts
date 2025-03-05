import { beforeAll, expect, describe, it, vi } from 'vitest'
import getTestDisk from '../../tests/testDrive'
import { createDatasetFromFile } from '../datasetsV2/createFromFile'
import * as factories from '../../tests/factories'
import { DatasetV2, User, Workspace } from '../../browser'
import { createRowsFromUploadedDataset } from './createRowsFromUploadedDataset'
import { DatasetV2CreatedEvent } from '../../events/events'
import { DatasetRowsRepository, DatasetsV2Repository } from '../../repositories'
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

    const createdDataset = await createDatasetFromFile({
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

  it('add rows to an existing dataset with rows', async () => {
    const dataset = await factories
      .createDatasetV2({
        disk: testDrive,
        workspace,
        author,
        fileContent: `
        name,surname
        Paco,Merlo
        Frank,Merlo
      `,
      })
      .then((r) => r.dataset)
    const { fileKey: anotherFileKey } = await createTestCsvFile({
      name: 'another.csv',
      fileContent: `
        age,name,surname
        18,François,Merlo
        29,Francesco,Merlo
      `,
    })
    expect(true).toBe(true)
    const event = {
      type: 'datasetUploaded' as DatasetV2CreatedEvent['type'],
      data: {
        workspaceId: workspace.id,
        datasetId: dataset.id,
        userEmail: author.email,
        csvDelimiter: ',',
        fileKey: anotherFileKey,
      },
    }
    await createRowsFromUploadedDataset({
      event,
      batchSize: 2,
      disk: testDrive,
    })
    const repo = new DatasetRowsRepository(workspace.id)
    const rows = await repo.findByDatasetPaginated({
      datasetId: dataset.id,
      page: '1',
      pageSize: '100',
    })
    const rowData = rows.map((r) => r.rowData)

    const datasetRepo = new DatasetsV2Repository(workspace.id)
    const freshDataset = await datasetRepo
      .find(dataset.id)
      .then((r) => r.unwrap())
    const columns = freshDataset.columns
    const name = columns.find((c) => c.name === 'name')!.identifier
    const surname = columns.find((c) => c.name === 'surname')!.identifier
    const age = columns.find((c) => c.name === 'age')!.identifier

    expect(columns).toEqual([
      { identifier: expect.any(String), name: 'name', role: 'parameter' },
      { identifier: expect.any(String), name: 'surname', role: 'parameter' },
      { identifier: expect.any(String), name: 'age', role: 'parameter' },
    ])
    expect(rowData).toEqual([
      {
        [name]: 'Paco',
        [surname]: 'Merlo',
      },
      {
        [name]: 'Frank',
        [surname]: 'Merlo',
      },
      {
        [name]: 'François',
        [surname]: 'Merlo',
        [age]: '18',
      },
      {
        [name]: 'Francesco',
        [surname]: 'Merlo',
        [age]: '29',
      },
    ])
  })
})
