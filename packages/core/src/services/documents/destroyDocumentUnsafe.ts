import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import Transaction from '../../lib/Transaction'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'

/**
 * Destroys a document without checking if the commit is merged.
 * This should only be used in specific cases where you need to bypass
 * the commit state check (e.g., force deleting from live commits via API).
 *
 * For normal use cases, use `destroyDocument` instead.
 */
export async function destroyDocumentUnsafe(
  {
    document,
    commit,
    workspace,
  }: {
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return destroyOrSoftDeleteDocuments(
    {
      documents: [document],
      commit,
      workspace,
    },
    transaction,
  )
}
