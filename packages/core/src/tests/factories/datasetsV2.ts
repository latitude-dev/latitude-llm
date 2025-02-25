import { faker } from '@faker-js/faker'

import { User, Workspace } from '../../browser'
import { DiskWrapper } from '../../lib/disk'
import { createDataset as createDatasetFn } from '../../services/datasetsV2/create'
import { createWorkspace, ICreateWorkspace } from './workspaces'
import { createTestCsvFile } from '../../services/datasetRows/testHelper'

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
  disk: DiskWrapper
  name?: string
  workspace?: Workspace | ICreateWorkspace
  author?: User
  csvDelimiter?: string
  fileContent?: string
}
type Props = Partial<ICreateDatasetV2> & { disk: DiskWrapper }

export async function createDatasetV2(datasetData: Props) {
  const disk = datasetData.disk
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
  const result = await createDatasetFn({
    author: user,
    workspace,
    disk,
    data: {
      name,
      file,
      csvDelimiter,
    },
  })

  const data = result.unwrap()

  return { dataset: data.dataset, user, workspace }
}
