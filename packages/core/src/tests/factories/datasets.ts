import { faker } from '@faker-js/faker'

import { DatasetV2CreatedEvent } from '../../events/events'
import { DiskWrapper } from '../../lib/disk'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createRowsFromUploadedDataset } from '../../services/datasetRows/createRowsFromUploadedDataset'
import { createTestCsvFile } from '../../services/datasetRows/testHelper'
import { createDatasetFromFile as createDatasetFromFileFn } from '../../services/datasets/createFromFile'
import { HashAlgorithmFn } from '../../services/datasets/utils'
import getTestDisk from '../testDrive'
import { createWorkspace, ICreateWorkspace } from './workspaces'

const defaultTestDisk = getTestDisk()

export function generateCsvContent({
  delimiter = ',',
  headers = ['id', 'name', 'email', 'age'],
  rows = Array.from({ length: 10 }, (_, i) => [
    String(i + 1),
    faker.person.fullName(),
    faker.internet.email(),
    String(faker.number.int({ min: 18, max: 80 })),
  ]),
}: {
  delimiter?: string
  headers?: string[]
  rows?: string[][]
}): string {
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

export async function createDataset(datasetData: Props) {
  const disk = datasetData.disk ?? defaultTestDisk
  const workspaceData = datasetData.workspace ?? {}
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

  const randomName = `${faker.word.noun()}-${faker.string.uuid()}`
  const { name = randomName } = datasetData

  const csvDelimiter = datasetData.csvDelimiter ?? ','
  const fileContent =
    datasetData.fileContent ?? generateCsvContent({ delimiter: csvDelimiter })

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
