import { DocumentVersion, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { ConflictError, Result, Transaction } from '../../lib'
import {
  DocumentSuggestionsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { documentSuggestions, evaluationVersions } from '../../schema'

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
  if (toVersion.deletedAt) return Result.nil()

  const repository = new DocumentSuggestionsRepository(workspace.id, db)

  const suggestions = await repository
    .listByDocumentVersion({
      commitId: fromVersion.commitId,
      documentUuid: fromVersion.documentUuid,
    })
    .then((r) => r.unwrap())

  if (!suggestions.length) return Result.nil()

  await db.insert(documentSuggestions).values(
    suggestions.map((suggestion) => ({
      ...suggestion,
      id: undefined,
      commitId: toVersion.commitId,
      updatedAt: toVersion.updatedAt,
    })),
  )

  return Result.nil()
}

async function inheritEvaluations(
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
  const repository = new EvaluationsV2Repository(workspace.id, db)

  const evaluations = await repository
    .listByDocumentVersion({
      commitId: fromVersion.commitId,
      documentUuid: fromVersion.documentUuid,
    })
    .then((r) => r.unwrap())

  if (!evaluations.length) return Result.nil()

  await db.insert(evaluationVersions).values(
    evaluations.map((evaluation) => ({
      ...evaluation,
      id: undefined,
      commitId: toVersion.commitId,
      updatedAt: toVersion.updatedAt,
      deletedAt: toVersion.deletedAt,
    })),
  )

  return Result.nil()
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

  return Transaction.call(async (tx) => {
    await Promise.all([
      inheritSuggestions({ fromVersion, toVersion, workspace }, tx).then((r) =>
        r.unwrap(),
      ),
      inheritEvaluations({ fromVersion, toVersion, workspace }, tx).then((r) =>
        r.unwrap(),
      ),
    ])

    return Result.nil()
  }, db)
}
