import { database } from '$core/client'
import { NotFoundError, Result } from '$core/lib'

import { getDocumentsAtCommit } from './getDocumentsAtCommit'

export async function getDocumentByPath(
  {
    projectId,
    commitUuid,
    path,
  }: {
    projectId: number
    commitUuid: string
    path: string
  },
  db = database,
) {
  try {
    const result = await getDocumentsAtCommit({ projectId, commitUuid }, db)
    const documents = result.unwrap()
    const document = documents.find((doc) => doc.path === path)
    if (!document) {
      return Result.error(
        new NotFoundError(
          `No document with path ${path} at commit ${commitUuid}`,
        ),
      )
    }

    return Result.ok(document)
  } catch (err) {
    return Result.error(err as Error)
  }
}
