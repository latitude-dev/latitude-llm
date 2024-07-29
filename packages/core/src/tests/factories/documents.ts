import { faker } from '@faker-js/faker'
import { database } from '$core/client'
import { documentVersions, type Commit } from '$core/schema'
import { createNewDocument } from '$core/services/documents/create'
import { updateDocument } from '$core/services/documents/update'
import { eq } from 'drizzle-orm'

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

export async function markAsSoftDelete(documentUuid: string, tx = database) {
  return tx
    .update(documentVersions)
    .set({ deletedAt: new Date() })
    .where(eq(documentVersions.documentUuid, documentUuid))
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
    commit: data.commit,
    path: data.path,
  })

  if (data.content) {
    result = await updateDocument({
      commit: data.commit,
      document: result.unwrap(),
      content: data.content,
    })
  }

  const documentVersion = result.unwrap()

  return { documentVersion }
}
