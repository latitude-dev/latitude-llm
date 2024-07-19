import { faker } from '@faker-js/faker'
import type { Commit } from '$core/schema'
import { createNewDocument } from '$core/services/documents/create'
import { modifyExistingDocument } from '$core/services/documents/modify'

export type IDocumentVersionData = {
  commit: Commit
  path?: string
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

  let result = await createNewDocument({
    commitId: data.commit.id,
    path: data.path,
  })

  if (data.content) {
    result = await modifyExistingDocument({
      commitId: data.commit.id,
      documentUuid: result.unwrap().documentUuid,
      content: data.content,
    })
  }

  const documentVersion = result.unwrap()
  return { documentVersion }
}
