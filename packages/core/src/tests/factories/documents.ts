import { faker } from '@faker-js/faker'
import type { Commit } from '$core/schema'
import { createDocumentVersion as createDocumentVersionFn } from '$core/services/documentVersions/create'

export type IDocumentVersionData = {
  commit: Commit
  path?: string
  documentUuid?: string
  content?: string
}

function makeRandomDocumentVersionData() {
  return {
    path: faker.commerce.productName().replace(/\s/g, '_').toLowerCase(),
    content: faker.lorem.paragraphs().toLowerCase(),
  }
}

export async function createDocumentVersion(
  documentData: IDocumentVersionData,
) {
  const randomData = makeRandomDocumentVersionData()

  const data = {
    ...randomData,
    content: randomData.content,
    ...documentData,
  }

  const result = await createDocumentVersionFn({
    projectId: data.commit.projectId,
    path: data.path,
    commitUuid: data.commit.uuid,
    documentUuid: data.documentUuid,
    content: data.content,
  })

  const documentVersion = result.unwrap()
  return { documentVersion }
}
