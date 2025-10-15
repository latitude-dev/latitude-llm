import { beforeAll, expect, describe, it, vi } from 'vitest'
import getTestDisk from '../../tests/testDrive'
import { createDatasetFromFile } from '../datasets/createFromFile'
import * as factories from '../../tests/factories'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createRowsFromUploadedDataset } from './createRowsFromUploadedDataset'
import { DatasetV2CreatedEvent } from '../../events/events'
import { DatasetRowsRepository, DatasetsRepository } from '../../repositories'
import { createTestCsvFile } from './testHelper'

const testDrive = getTestDisk()

let workspace: Workspace
let author: User
let dataset: Dataset
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
        [name]: 'Franz',
        [surname]: 'Merlo',
        [age]: 48,
        [nationality]: 'German',
      },
      {
        [name]: 'Francis',
        [surname]: 'Merlo',
        [age]: 23,
        [nationality]: 'British',
      },
      {
        [name]: 'Frančišek',
        [surname]: 'Merlo',
        [age]: 89,
        [nationality]: 'Slovenian',
      },
      {
        [name]: 'Francisco',
        [surname]: 'Merlo',
        [age]: 9,
        [nationality]: 'Portuguese',
      },
      {
        [name]: 'Francesco',
        [surname]: 'Merlo',
        [age]: 19,
        [nationality]: 'Italian',
      },
      {
        [name]: 'François',
        [surname]: 'Merlo',
        [age]: 84,
        [nationality]: 'French',
      },
      {
        [name]: 'Frank',
        [surname]: 'Merlo',
        [age]: 11,
        [nationality]: 'North American',
      },
      {
        [name]: 'Paco',
        [surname]: 'Merlo',
        [age]: 43,
        [nationality]: 'Spanish',
      },
    ])
  })

  it('add rows to an existing dataset with rows', async () => {
    const dataset = await factories
      .createDataset({
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
    const francoisJson = JSON.stringify({
      name: 'valueFrançois',
      age: 18,
    }).replace(/"/g, '""')
    const francescoJson = JSON.stringify({
      name: 'valueFrancesco',
      age: 29,
    }).replace(/"/g, '""')
    const { fileKey: anotherFileKey } = await createTestCsvFile({
      name: 'another.csv',
      fileContent: `
        age,name,surname,json_data,nullColumn,emptyColumn,booleanColumn,dateColumn,floatColumn
        18,François,Merlo,"${francoisJson}",null,"",true,2000-01-01,1.1
        29,Francesco,Merlo,"${francescoJson}","null","",false,2025-01-01,3.3
      `.trim(),
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

    const datasetRepo = new DatasetsRepository(workspace.id)
    const freshDataset = await datasetRepo
      .find(dataset.id)
      .then((r) => r.unwrap())
    const columns = freshDataset.columns
    const name = columns.find((c) => c.name === 'name')!.identifier
    const surname = columns.find((c) => c.name === 'surname')!.identifier
    const age = columns.find((c) => c.name === 'age')!.identifier
    const jsonCol = columns.find((c) => c.name === 'json_data')!.identifier
    const nullCol = columns.find((c) => c.name === 'nullColumn')!.identifier
    const emptyCol = columns.find((c) => c.name === 'emptyColumn')!.identifier
    const booleanCol = columns.find(
      (c) => c.name === 'booleanColumn',
    )!.identifier
    const dateCol = columns.find((c) => c.name === 'dateColumn')!.identifier
    const floatCol = columns.find((c) => c.name === 'floatColumn')!.identifier

    expect(columns).toEqual([
      { identifier: expect.any(String), name: 'name', role: 'parameter' },
      { identifier: expect.any(String), name: 'surname', role: 'parameter' },
      { identifier: expect.any(String), name: 'age', role: 'parameter' },
      { identifier: expect.any(String), name: 'json_data', role: 'parameter' },
      { identifier: expect.any(String), name: 'nullColumn', role: 'parameter' },
      {
        identifier: expect.any(String),
        name: 'emptyColumn',
        role: 'parameter',
      },
      {
        identifier: expect.any(String),
        name: 'booleanColumn',
        role: 'parameter',
      },
      { identifier: expect.any(String), name: 'dateColumn', role: 'parameter' },
      {
        identifier: expect.any(String),
        name: 'floatColumn',
        role: 'parameter',
      },
    ])
    expect(rowData).toEqual([
      {
        [name]: 'Francesco',
        [surname]: 'Merlo',
        [age]: 29,
        [jsonCol]: { name: 'valueFrancesco', age: 29 },
        [nullCol]: '',
        [emptyCol]: '',
        [booleanCol]: false,
        [dateCol]: '2025-01-01T00:00:00.000Z',
        [floatCol]: 3.3,
      },
      {
        [name]: 'François',
        [surname]: 'Merlo',
        [age]: 18,
        [jsonCol]: { name: 'valueFrançois', age: 18 },
        [nullCol]: '',
        [emptyCol]: '',
        [booleanCol]: true,
        [dateCol]: '2000-01-01T00:00:00.000Z',
        [floatCol]: 1.1,
      },
      {
        [name]: 'Frank',
        [surname]: 'Merlo',
      },
      {
        [name]: 'Paco',
        [surname]: 'Merlo',
      },
    ])
  })
})
