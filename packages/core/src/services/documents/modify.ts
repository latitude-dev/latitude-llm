import { omit } from 'lodash-es'

import { readMetadata } from '@latitude-data/compiler'
import {
  DocumentVersion,
  documentVersions,
  getDocumentsAtCommit,
  Result,
  Transaction,
} from '@latitude-data/core'
import { LatitudeError, NotFoundError } from '$core/lib/errors'

import { existsAnotherDocumentWithSamePath, getEditableCommit } from './utils'

async function findUpdatedDocuments(documents: DocumentVersion[]) {
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

export async function modifyExistingDocument({
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
  const commitResult = await getEditableCommit(commitId)
  if (commitResult.error) return commitResult

  const currentDocuments = await getDocumentsAtCommit({
    commitId,
    commitMergedAt: commitResult.value.mergedAt,
  })
  if (currentDocuments.error) return currentDocuments

  const currentDocumentData = currentDocuments.value.find(
    (d) => d.documentUuid === documentUuid,
  )
  if (!currentDocumentData) {
    return Result.error(new NotFoundError('Document does not exist'))
  }

  const updateData = Object.fromEntries(
    Object.entries({ path, content, deletedAt }).filter(
      ([_, v]) => v !== undefined,
    ),
  )

  const newDocumentData = Object.assign(currentDocumentData, updateData)

  // If the path is changed, check if there is another document with the same path before updating the document
  if (path !== undefined) {
    if (
      existsAnotherDocumentWithSamePath({
        documents: currentDocuments.value,
        path: newDocumentData.path,
      })
    ) {
      return Result.error(
        new LatitudeError('A document with the same path already exists'),
      )
    }
  }

  const newDocuments = [
    ...currentDocuments.value.filter(
      (d) => d.documentUuid !== newDocumentData.documentUuid,
    ),
    newDocumentData,
  ]

  const updatedDocuments = await findUpdatedDocuments(newDocuments)

  return Transaction.call<DocumentVersion>(async (tx) => {
    const results = await Promise.all(
      updatedDocuments.map(async (document) => {
        const newDocumentVersion = {
          ...omit(document, ['id', 'createdAt', 'updatedAt']),
          commitId,
        }
        return await tx
          .insert(documentVersions)
          .values(newDocumentVersion)
          .onConflictDoUpdate({
            target: [documentVersions.documentUuid, documentVersions.commitId],
            set: newDocumentVersion,
          })
          .returning()
          .then((r) => r[0]!)
      }),
    )

    return Result.ok(results.find((r) => r.documentUuid === documentUuid)!)
  })
}
