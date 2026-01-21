import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { ConflictError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'

export async function inheritDocumentRelations(
  {
    fromVersion,
    toVersion,
    workspace: _workspace,
  }: {
    fromVersion: DocumentVersion
    toVersion: DocumentVersion
    workspace: Workspace
  },
  _transaction = new Transaction(),
) {
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
