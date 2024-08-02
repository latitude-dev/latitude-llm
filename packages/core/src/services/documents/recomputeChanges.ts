import type { CompileError } from '@latitude-data/compiler'
import { Commit, DocumentVersion } from '$core/browser'
import { database } from '$core/client'
import { Result, TypedResult } from '$core/lib'

import {
  assertCommitIsDraft,
  getMergedAndDraftDocuments,
  replaceCommitChanges,
  resolveDocumentChanges,
} from './utils'

export type RecomputedChanges = {
  changedDocuments: DocumentVersion[]
  headDocuments: DocumentVersion[]
  errors: { [documentUuid: string]: CompileError[] }
}

export async function recomputeChanges(
  draft: Commit,
  tx = database,
): Promise<TypedResult<RecomputedChanges, Error>> {
  try {
    assertCommitIsDraft(draft).unwrap()

    const [mergedDocuments, draftDocuments] = (
      await getMergedAndDraftDocuments(
        {
          draft,
        },
        tx,
      )
    ).unwrap()

    const { documents: documentsToUpdate, errors } =
      await resolveDocumentChanges({
        originalDocuments: mergedDocuments,
        newDocuments: draftDocuments,
      })

    const newDraftDocuments = (
      await replaceCommitChanges(
        {
          commitId: draft.id,
          documentChanges: documentsToUpdate,
        },
        tx,
      )
    ).unwrap()

    return Result.ok({
      headDocuments: mergedDocuments,
      changedDocuments: newDraftDocuments,
      errors,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
