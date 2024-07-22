import {
  DocumentVersion,
  documentVersions,
  getDocumentsAtCommit,
  Result,
  Transaction,
} from '@latitude-data/core'
import { BadRequestError } from '$core/lib/errors'

import {
  assertCommitIsEditable,
  existsAnotherDocumentWithSamePath,
} from './utils'

export async function createNewDocument({
  commitId,
  path,
}: {
  commitId: number
  path: string
}) {
  const commitResult = await assertCommitIsEditable(commitId)
  if (commitResult.error) return commitResult

  const currentDocuments = await getDocumentsAtCommit({
    commitId,
  })
  if (currentDocuments.error) return currentDocuments

  if (
    existsAnotherDocumentWithSamePath({
      documents: currentDocuments.value,
      path,
    })
  ) {
    return Result.error(
      new BadRequestError('A document with the same path already exists'),
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
