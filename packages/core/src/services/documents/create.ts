import { DocumentVersion, Result } from '@latitude-data/core'
import { BadRequestError } from '$core/lib/errors'

import {
  getDraft,
  getMergedAndDraftDocuments,
  replaceCommitChanges,
  resolveDocumentChanges,
} from './shared'

export async function createNewDocument({
  commitId,
  path,
}: {
  commitId: number
  path: string
}) {
  try {
    const draft = (await getDraft(commitId)).unwrap()

    const [mergedDocuments, draftDocuments] = (
      await getMergedAndDraftDocuments({
        draft,
      })
    ).unwrap()

    if (path && draftDocuments.find((d) => d.path === path)) {
      return Result.error(
        new BadRequestError('A document with the same path already exists'),
      )
    }

    draftDocuments.push({
      path,
      content: '',
    } as DocumentVersion)

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

    return Result.ok(newDraftDocuments.find((d) => d.path === path)!)
  } catch (error) {
    return Result.error(error as Error)
  }
}
