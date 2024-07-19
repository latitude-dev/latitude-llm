import { omit } from 'lodash-es'

import { readMetadata } from '@latitude-data/compiler'
import { getDocumentsAtCommit } from '$core/data-access'
import { Result, Transaction, TypedResult } from '$core/lib'
import { BadRequestError, LatitudeError, NotFoundError } from '$core/lib/errors'
import { DocumentVersion, documentVersions } from '$core/schema'
import { eq } from 'drizzle-orm'

import { assertCommitIsEditable } from './utils'

async function findDocumentsWithUpdatedHash(documents: DocumentVersion[]) {
  const getDocumentContent = async (path: string): Promise<string> => {
    const document = documents.find((d) => d.path === path)
    if (!document) {
      throw new Error(`Document not found`)
    }
    return document.content
  }

  const updatedDocuments: DocumentVersion[] = []
  for (const document of documents) {
    const { hash: newHash } = await readMetadata({
      prompt: document.content ?? '',
      referenceFn: getDocumentContent,
    })

    if (newHash !== document.hash) {
      updatedDocuments.push({
        ...document,
        hash: newHash,
      })
    }
  }

  return updatedDocuments
}

async function getUpdatedDocuments({
  currentDocuments,
  updateData,
}: {
  currentDocuments: DocumentVersion[]
  updateData: Partial<DocumentVersion>
}): Promise<TypedResult<DocumentVersion[], LatitudeError>> {
  const currentDocumentData = currentDocuments.find(
    (d) => d.documentUuid === updateData.documentUuid!,
  )
  if (!currentDocumentData) {
    return Result.error(new NotFoundError('Document does not exist'))
  }

  const newDocumentData = { ...currentDocumentData, ...updateData }

  const newDocumentsInCommit = [
    ...currentDocuments.filter(
      (d) => d.documentUuid !== newDocumentData.documentUuid,
    ),
    newDocumentData,
  ]

  const documentsWithUpdatedHash =
    await findDocumentsWithUpdatedHash(newDocumentsInCommit)

  if (
    !documentsWithUpdatedHash.find(
      (d) => d.documentUuid === newDocumentData.documentUuid,
    )
  ) {
    // The modified document may not have its hash updated, but it still needs to be added to the list of updated documents
    documentsWithUpdatedHash.push(newDocumentData)
  }

  return Result.ok(documentsWithUpdatedHash)
}

export async function updateDocument({
  commitId,
  documentUuid,
  path,
  content,
  deletedAt,
}: {
  commitId: number
  documentUuid: string
  path?: string
  content?: string | null
  deletedAt?: Date | null
}) {
  const commitResult = await assertCommitIsEditable(commitId)
  if (commitResult.error) return commitResult

  const updateData = Object.fromEntries(
    Object.entries({ documentUuid, path, content, deletedAt }).filter(
      ([_, v]) => v !== undefined,
    ),
  )

  const currentDocuments = await getDocumentsAtCommit({
    commitId,
  })
  if (currentDocuments.error) return currentDocuments

  if (
    path &&
    currentDocuments.value.find(
      (d) => d.documentUuid !== documentUuid && d.path === path,
    )
  ) {
    return Result.error(
      new BadRequestError('A document with the same path already exists'),
    )
  }

  const documentsToUpdateResult = await getUpdatedDocuments({
    currentDocuments: currentDocuments.value,
    updateData,
  })
  if (documentsToUpdateResult.error) return documentsToUpdateResult
  const documentsToUpdate = documentsToUpdateResult.value

  return Transaction.call<DocumentVersion>(async (tx) => {
    const results = await Promise.all(
      documentsToUpdate.map(async (documentData) => {
        const isNewDocumentVersion = documentData.commitId !== commitId
        const newDocumentVersion = {
          ...omit(documentData, ['id', 'commitId', 'updatedAt', 'createdAt']),
          path: documentData.path, // <- This should not be necessary, but Typescript somehow is not sure that path is present.
          commitId,
        }

        if (isNewDocumentVersion) {
          return await tx
            .insert(documentVersions)
            .values(newDocumentVersion)
            .returning()
            .then((r) => r[0]!)
        }

        return await tx
          .update(documentVersions)
          .set(newDocumentVersion)
          .where(eq(documentVersions.id, documentData.id))
          .returning()
          .then((r) => r[0]!)
      }),
    )

    return Result.ok(results.find((r) => r.documentUuid === documentUuid)!)
  })
}
