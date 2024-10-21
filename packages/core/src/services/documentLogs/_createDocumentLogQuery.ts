import { eq, isNotNull, or, sum } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import { DocumentLogsWithErrorsRepository } from '../../repositories'
import { commits, providerLogs } from '../../schema'

export function createDocumentLogQuery(workspaceId: number, db = database) {
  const documentLogsScope = new DocumentLogsWithErrorsRepository(
    workspaceId,
    db,
  )
  const scope = documentLogsScope.scope

  const aggregatedFieldsSubQuery = db
    .select({
      id: scope.id,
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      duration: sum(providerLogs.duration).mapWith(Number).as('duration_in_ms'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(scope)
    .leftJoin(providerLogs, eq(providerLogs.documentLogUuid, scope.uuid))
    .groupBy(scope.id)
    .as('aggregatedFieldsSubQuery')

  return {
    scope,
    aggregatedFieldsSubQuery,
    baseQuery: db
      .select({
        ...scope._.selectedFields,
        commit: commits,
        tokens: aggregatedFieldsSubQuery.tokens,
        duration: aggregatedFieldsSubQuery.duration,
        costInMillicents: aggregatedFieldsSubQuery.costInMillicents,
      })
      .from(scope)
      .innerJoin(commits, eq(commits.id, scope.commitId))
      .innerJoin(
        aggregatedFieldsSubQuery,
        eq(aggregatedFieldsSubQuery.id, scope.id),
      ),
  }
}

export function getCommitFilter(draft?: Commit) {
  return draft
    ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
    : isNotNull(commits.mergedAt)
}
