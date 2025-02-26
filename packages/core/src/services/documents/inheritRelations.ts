import { DocumentVersion, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { ConflictError, Result } from '../../lib'
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
  db: Database = database,
) {
  const repository = new DocumentSuggestionsRepository(workspace.id, db)

  const suggestions = await repository
    .listByDocumentVersion({
      commitId: fromVersion.commitId,
      documentUuid: fromVersion.documentUuid,
    })
    .then((r) => r.unwrap())

  await db.insert(documentSuggestions).values(
    suggestions.map((suggestion) => ({
      ...suggestion,
      id: undefined,
      commitId: toVersion.commitId,
      documentUuid: toVersion.documentUuid,
    })),
  )
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
  db: Database = database,
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

  await Promise.all([
    inheritSuggestions({ fromVersion, toVersion, workspace }, db),
  ])

  return Result.nil()
}
