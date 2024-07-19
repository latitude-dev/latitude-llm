import {
  DocumentVersion,
  documentVersions,
  getDocumentsAtCommit,
  Result,
  Transaction,
} from '@latitude-data/core'
import { LatitudeError } from '$core/lib/errors'

import { existsAnotherDocumentWithSamePath, getEditableCommit } from './utils'

export async function createNewDocument({
  commitId,
  path,
}: {
  commitId: number
  path: string
}) {
  const commitResult = await getEditableCommit(commitId)
  if (commitResult.error) return commitResult

  const currentDocuments = await getDocumentsAtCommit({
    commitId,
    commitMergedAt: commitResult.value.mergedAt,
  })
  if (currentDocuments.error) return currentDocuments

  if (
    existsAnotherDocumentWithSamePath({
      documents: currentDocuments.value,
      path,
    })
  ) {
    return Result.error(
      new LatitudeError('A document with the same path already exists'),
    )
  }

  return Transaction.call<DocumentVersion>(async (tx) => {
    const result = await tx
      .insert(documentVersions)
      .values({
        commitId,
        path,
      })
      .returning()
    const documentVersion = result[0]
    return Result.ok(documentVersion!)
  })
}
