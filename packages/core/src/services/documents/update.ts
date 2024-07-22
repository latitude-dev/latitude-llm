import { Result, TypedResult } from '$core/lib'
import { BadRequestError, NotFoundError } from '$core/lib/errors'
import { DocumentVersion } from '$core/schema'

import {
  getDraft,
  getMergedAndDraftDocuments,
  replaceCommitChanges,
  resolveDocumentChanges,
} from './shared'

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
}): Promise<TypedResult<DocumentVersion, Error>> {
  try {
    const draft = (await getDraft(commitId)).unwrap()

    const [mergedDocuments, draftDocuments] = (
      await getMergedAndDraftDocuments({
        draft,
      })
    ).unwrap()

    const updatedDocData = Object.fromEntries(
      Object.entries({ documentUuid, path, content, deletedAt }).filter(
        ([_, v]) => v !== undefined,
      ),
    )

    const originalDoc = draftDocuments.find(
      (d) => d.documentUuid === documentUuid!,
    )

    if (!originalDoc) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    Object.assign(originalDoc, updatedDocData)

    if (
      path &&
      draftDocuments.find(
        (d) => d.documentUuid !== documentUuid && d.path === path,
      )
    ) {
      return Result.error(
        new BadRequestError('A document with the same path already exists'),
      )
    }

    const documentsToUpdate = await resolveDocumentChanges({
      originalDocuments: mergedDocuments,
      newDocuments: draftDocuments,
    })

    const newDraftDocuments = (
      await replaceCommitChanges({
        commitId,
        documentChanges: documentsToUpdate,
      })
    ).unwrap()

    return Result.ok(
      newDraftDocuments.find((d) => d.documentUuid === documentUuid)!,
    )
  } catch (error) {
    return Result.error(error as Error)
  }
}
