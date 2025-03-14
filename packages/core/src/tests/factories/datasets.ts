import { faker } from '@faker-js/faker'

import { User, Workspace } from '../../browser'
import { DiskWrapper } from '../../lib/disk'
import { createDataset as createDatasetFn } from '../../services/datasets/create'
import { createWorkspace, ICreateWorkspace } from './workspaces'

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

function createMockFile({
  name,
  delimiter,
  fileContent,
}: {
  name: string
  delimiter: string
  fileContent?: string
}) {
  const content = fileContent ?? generateCsvContent(delimiter)
  return new File([content], `${name}.csv`, { type: 'text/csv' })
}

function createMockDisk({ file, name }: { file: File; name: string }) {
  return {
    putFile: async () => ({ error: null }),
    file: () => ({
      toSnapshot: async () => ({
        name: `${name}.csv`,
        size: file.size,
        type: file.type,
        lastModified: new Date(),
      }),
    }),
  } as unknown as DiskWrapper
}

export type ICreateDataset = {
  name?: string
  workspace?: Workspace | ICreateWorkspace
  author?: User
  csvDelimiter?: string
  fileContent?: string
  disk?: DiskWrapper
  file?: File
}

export async function createDataset(datasetData: Partial<ICreateDataset> = {}) {
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
  const name = datasetData.name ?? faker.commerce.productName()
  const delimiter = datasetData.csvDelimiter ?? ','
  const file =
    datasetData.file ??
    createMockFile({
      name,
      fileContent: datasetData.fileContent,
      delimiter,
    })
  const disk = datasetData.disk ?? createMockDisk({ file, name })
  const result = await createDatasetFn({
    author: user,
    workspace,
    disk,
    data: {
      name,
      file,
      csvDelimiter: delimiter,
    },
  })

  const dataset = result.unwrap()

  return { dataset, user, workspace }
}
