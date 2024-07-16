import { faker } from '@faker-js/faker'
import { DocumentType } from '$core/constants'
import type { Commit, DocumentVersion } from '$core/schema'
import { createDocumentVersion as createDocumentVersionFn } from '$core/services/documentVersions/create'

export type IDocumentVersionData = {
  commit: Commit
  documentUuid?: string
  name?: string
  content?: string
  parentFolder?: DocumentVersion
  type?: DocumentType
}

function makeRandomDocumentVersionData() {
  return {
    name: faker.commerce.department(),
    content: faker.lorem.paragraphs(),
  }
}

export async function createDocumentVersion(
  documentData: IDocumentVersionData,
) {
  const randomData = makeRandomDocumentVersionData()

  const data = {
    ...randomData,
    type: DocumentType.Document,
    content:
      documentData.type === DocumentType.Folder
        ? undefined
        : randomData.content,
    ...documentData,
  }

  const result = await createDocumentVersionFn({
    projectId: data.commit.projectId,
    name: data.name,
    commitUuid: data.commit.uuid,
    documentType: data.type,
    parentId: data.parentFolder?.id,
    documentUuid: data.documentUuid,
    content: data.content,
  })

  const documentVersion = result.unwrap()
  return { documentVersion }
}
