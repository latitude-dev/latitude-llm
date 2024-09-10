import { faker } from '@faker-js/faker'

import { SafeUser, Workspace } from '../../browser'
import { DiskWrapper } from '../../lib/disk'
import { createDataset as createDatasetFn } from '../../services/datasets/create'
import { createWorkspace, ICreateWorkspace } from './workspaces'

export type ICreateDataset = {
  name?: string
  workspace?: Workspace | ICreateWorkspace
  author?: SafeUser
  csvDelimiter?: string
  fileContent?: string
}

export async function createDataset(datasetData: Partial<ICreateDataset> = {}) {
  let workspaceData = datasetData.workspace ?? {}
  let user: SafeUser
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

  const file = new File([fileContent], `${name}.csv`, { type: 'text/csv' })

  const mockDisk: DiskWrapper = {
    putFile: async () => ({ error: null }),
    file: () => ({
      toSnapshot: async () => ({
        name: `${name}.csv`,
        size: file.size,
        type: file.type,
        lastModified: new Date(),
      }),
    }),
  } as any

  const result = await createDatasetFn({
    author: user,
    workspace,
    disk: mockDisk,
    data: {
      name,
      file,
      csvDelimiter,
    },
  })

  const dataset = result.unwrap()

  return { dataset, user, workspace }
}

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
