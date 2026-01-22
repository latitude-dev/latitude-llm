import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { ConflictError } from '../../lib/errors'
import { Result } from '../../lib/Result'

export function canInheritDocumentRelations({
  fromVersion,
  toVersion,
}: {
  fromVersion: DocumentVersion
  toVersion: DocumentVersion
}) {
  if (
    fromVersion.id === toVersion.id ||
    fromVersion.commitId === toVersion.commitId
  ) {
    return Result.nil()
  }
  if (fromVersion.documentUuid !== toVersion.documentUuid) {
    return Result.error(
      new ConflictError('Cannot inherit relations between different documents'),
    )
  }

  return Result.nil()
}
