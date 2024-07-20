import type { CompileError } from '@latitude-data/compiler'
import { database } from '$core/client'
import { Result, TypedResult } from '$core/lib'
import { BadRequestError } from '$core/lib/errors'
import { Commit, DocumentVersion } from '$core/schema'

import {
  getMergedAndDraftDocuments,
  replaceCommitChanges,
  resolveDocumentChanges,
} from './utils'

type RecomputedChanges = {
  documents: DocumentVersion[]
  errors: { [documentUuid: string]: CompileError[] }
}

export async function recomputeChanges(
  draft: Commit,
  tx = database,
): Promise<TypedResult<RecomputedChanges, Error>> {
  try {
    if (draft.mergedAt !== null) {
      return Result.error(
        new BadRequestError('Cannot recompute changes in a merged commit'),
      )
    }

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

    return Result.ok({ documents: newDraftDocuments, errors })
  } catch (error) {
    return Result.error(error as Error)
  }
}
