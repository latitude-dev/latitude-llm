import { and, desc, eq, getTableColumns, sql, sum } from 'drizzle-orm'

import { Commit, Evaluation } from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { EvaluationResultsWithErrorsRepository } from '../../repositories'
import { commits, documentLogs, providerLogs } from '../../schema'
import { getCommitFilter } from './_createEvaluationResultQuery'

function getRepositoryScopes(workspaceId: number, db = database) {
  const evaluationResultsScope = new EvaluationResultsWithErrorsRepository(
    workspaceId,
    db,
  ).scope

  return { evaluationResultsScope }
}

function getCommonQueryConditions(
  evaluationResultsScope: any,
  documentLogsScope: any,
  evaluation: Evaluation,
  documentUuid: string,
  draft?: Commit,
) {
  return and(
    eq(evaluationResultsScope.evaluationId, evaluation.id),
    eq(documentLogsScope.documentUuid, documentUuid),
    getCommitFilter(draft),
  )
}

export async function computeEvaluationResultsWithMetadata(
  {
    workspaceId,
    evaluation,
    documentUuid,
    draft,
    page = '1',
    pageSize = '25',
  }: {
    workspaceId: number
    evaluation: Evaluation
    documentUuid: string
    draft?: Commit
    page?: string
    pageSize?: string
  },
  db = database,
) {
  const { evaluationResultsScope } = getRepositoryScopes(workspaceId, db)

  const offset = calculateOffset(page, pageSize)
  const filteredResultsSubQuery = db
    .select({
      id: evaluationResultsScope.id,
      evaluationProviderLogId: evaluationResultsScope.evaluationProviderLogId,
      error: evaluationResultsScope.error,
    })
    .from(evaluationResultsScope)
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(
      getCommonQueryConditions(
        evaluationResultsScope,
        documentLogs,
        evaluation,
        documentUuid,
        draft,
      ),
    )
    .orderBy(desc(evaluationResultsScope.createdAt))
    .limit(parseInt(pageSize))
    .offset(offset)
    .as('filteredResultsSubQuery')

  const aggregatedFieldsSubQuery = db
    .select({
      id: evaluationResultsScope.id,
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(evaluationResultsScope)
    .innerJoin(
      filteredResultsSubQuery,
      eq(filteredResultsSubQuery.id, evaluationResultsScope.id),
    )
    .leftJoin(
      providerLogs,
      eq(providerLogs.id, filteredResultsSubQuery.evaluationProviderLogId),
    )
    .groupBy(evaluationResultsScope.id)
    .as('aggregatedFieldsSubQuery')

  return db
    .select({
      ...evaluationResultsScope._.selectedFields,
      commit: getTableColumns(commits),
      tokens: aggregatedFieldsSubQuery.tokens,
      costInMillicents: aggregatedFieldsSubQuery.costInMillicents,
      documentContentHash: documentLogs.contentHash,
    })
    .from(evaluationResultsScope)
    .innerJoin(
      aggregatedFieldsSubQuery,
      eq(aggregatedFieldsSubQuery.id, evaluationResultsScope.id),
    )
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .orderBy(desc(evaluationResultsScope.createdAt))
}

export async function computeEvaluationResultsWithMetadataCount(
  {
    workspaceId,
    evaluation,
    documentUuid,
    draft,
  }: {
    workspaceId: number
    evaluation: Evaluation
    documentUuid: string
    draft?: Commit
  },
  db = database,
) {
  const { evaluationResultsScope } = getRepositoryScopes(workspaceId, db)

  return db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(evaluationResultsScope)
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(
      getCommonQueryConditions(
        evaluationResultsScope,
        documentLogs,
        evaluation,
        documentUuid,
        draft,
      ),
    )
}
