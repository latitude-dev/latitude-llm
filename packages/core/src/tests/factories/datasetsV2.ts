import { faker } from '@faker-js/faker'

import { User, Workspace } from '../../browser'
import { DiskWrapper } from '../../lib/disk'
import { createDatasetFromFile as createDatasetFromFileFn } from '../../services/datasetsV2/createFromFile'
import { createWorkspace, ICreateWorkspace } from './workspaces'
import { createTestCsvFile } from '../../services/datasetRows/testHelper'
import { DatasetV2CreatedEvent } from '../../events/events'
import { createRowsFromUploadedDataset } from '../../services/datasetRows/createRowsFromUploadedDataset'
import { HashAlgorithmFn } from '../../services/datasetsV2/utils'
import getTestDisk from '../testDrive'

const defaultTestDisk = getTestDisk()

function generateCsvContent(delimiter: string): string {
  const headers = ['id', 'name', 'email', 'age']
  const rows = Array.from({ length: 10 }, (_, i) => [
    i + 1,
    faker.person.fullName(),
    faker.internet.email(),
    faker.number.int({ min: 18, max: 80 }),
  ])

  return [
    headers.join(delimiter),
    ...rows.map((row) => row.join(delimiter)),
  ].join('\n')
}

export type ICreateDatasetV2 = {
  name?: string
  workspace?: Workspace | ICreateWorkspace
  author?: User
  csvDelimiter?: string
  fileContent?: string
  disk?: DiskWrapper
  hashAlgorithm?: HashAlgorithmFn
}
type Props = Partial<ICreateDatasetV2>

export async function createDatasetV2(datasetData: Props) {
  const disk = datasetData.disk ?? defaultTestDisk
  let workspaceData = datasetData.workspace ?? {}
  let user: User
  let workspace: Workspace

  if ('id' in workspaceData) {
    workspace = workspaceData as Workspace
    user = datasetData.author!
  } else {
    const newWorkspace = await createWorkspace(workspaceData)
    workspace = newWorkspace.workspace
    user = newWorkspace.userData
  }

  const randomName = faker.commerce.productName()
  const { name = randomName } = datasetData

  const csvDelimiter = datasetData.csvDelimiter ?? ','
  const fileContent =
    datasetData.fileContent ?? generateCsvContent(csvDelimiter)

  const { file } = await createTestCsvFile({ fileContent, name })
  const result = await createDatasetFromFileFn({
    author: user,
    workspace,
    disk,
    hashAlgorithm: datasetData.hashAlgorithm,
    data: {
      name,
      file,
      csvDelimiter,
    },
  })

  const data = result.unwrap()

  const event = {
    type: 'datasetUploaded' as DatasetV2CreatedEvent['type'],
    data: {
      workspaceId: workspace.id,
      datasetId: data.dataset.id,
      userEmail: user.email,
      csvDelimiter: ',',
      fileKey: data.fileKey,
    },
  }
  await createRowsFromUploadedDataset({
    event,
    batchSize: 2,
    disk,
    hashAlgorithm: datasetData.hashAlgorithm,
  })

  return { dataset: data.dataset, user, workspace }
}
