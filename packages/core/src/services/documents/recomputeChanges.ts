import type { CompileError } from '@latitude-data/compiler'
import { database } from '$core/client'
import { findCommitById } from '$core/data-access'
import { Result, TypedResult } from '$core/lib'
import { BadRequestError } from '$core/lib/errors'
import { DocumentVersion } from '$core/schema'

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
  {
    commitId,
  }: {
    commitId: number
  },
  tx = database,
): Promise<TypedResult<RecomputedChanges, Error>> {
  try {
    const draft = (await findCommitById({ id: commitId }, tx)).unwrap()
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
          commitId,
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
