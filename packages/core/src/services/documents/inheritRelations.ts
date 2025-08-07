import type { DocumentVersion, Workspace } from '../../browser'
import { ConflictError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentSuggestionsRepository } from '../../repositories'
import { documentSuggestions } from '../../schema'

async function inheritSuggestions(
  {
    fromVersion,
    toVersion,
    workspace,
  }: {
    fromVersion: DocumentVersion
    toVersion: DocumentVersion
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  if (toVersion.deletedAt) return Result.nil()

  return transaction.call(async (tx) => {
    const repository = new DocumentSuggestionsRepository(workspace.id, tx)

    const suggestions = await repository
      .listByDocumentVersion({
        commitId: fromVersion.commitId,
        documentUuid: fromVersion.documentUuid,
      })
      .then((r) => r.unwrap())

    if (!suggestions.length) return Result.nil()

    await tx.insert(documentSuggestions).values(
      suggestions.map((suggestion) => ({
        ...suggestion,
        id: undefined,
        commitId: toVersion.commitId,
        documentUuid: toVersion.documentUuid,
      })),
    )

    return Result.nil()
  })
}

export async function inheritDocumentRelations(
  {
    fromVersion,
    toVersion,
    workspace,
  }: {
    fromVersion: DocumentVersion
    toVersion: DocumentVersion
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  if (fromVersion.id === toVersion.id || fromVersion.commitId === toVersion.commitId) {
    return Result.nil()
  }
  if (fromVersion.documentUuid !== toVersion.documentUuid) {
    return Result.error(new ConflictError('Cannot inherit relations between different documents'))
  }

  await Promise.all([
    inheritSuggestions({ fromVersion, toVersion, workspace }, transaction).then((r) => r.unwrap()),
  ])

  return Result.nil()
}
