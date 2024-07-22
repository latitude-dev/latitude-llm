import {
  DocumentVersion,
  findCommitById,
  Result,
  TypedResult,
} from '@latitude-data/core'
import { ForbiddenError, LatitudeError } from '$core/lib/errors'

export async function assertCommitIsEditable(
  commitId: number,
): Promise<TypedResult<void, LatitudeError>> {
  const commit = await findCommitById({ id: commitId })

  if (commit.value?.mergedAt !== null) {
    return Result.error(
      new ForbiddenError('Cannot create a document version in a merged commit'),
    )
  }

  return Result.nil()
}

export function existsAnotherDocumentWithSamePath({
  documents,
  path,
}: {
  documents: DocumentVersion[]
  path: string
}) {
  return documents.find((d) => d.path === path) !== undefined
}
