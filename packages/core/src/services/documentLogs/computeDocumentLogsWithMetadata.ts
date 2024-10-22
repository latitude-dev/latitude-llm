import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  or,
  sql,
  sum,
} from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import {
  DocumentLogsWithErrorsRepository,
  DocumentLogWithErrorScope,
} from '../../repositories'
import { commits, providerLogs } from '../../schema'

function getRepositoryScopes(workspaceId: number, db = database) {
  const scope = new DocumentLogsWithErrorsRepository(workspaceId, db).scope

  return { scope }
}

function getCommitFilter(draft?: Commit) {
  return draft
    ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
    : isNotNull(commits.mergedAt)
}

function getCommonQueryConditions({
  scope,
  documentUuid,
  draft,
  allowAnyDraft,
}: {
  scope: DocumentLogWithErrorScope
  documentUuid?: string
  allowAnyDraft?: boolean
  draft?: Commit
}) {
  const byDocumentUuid = documentUuid
    ? eq(scope.documentUuid, documentUuid)
    : sql`1 = 1`

  if (allowAnyDraft) return byDocumentUuid

  return and(byDocumentUuid, getCommitFilter(draft))
}

export function computeDocumentLogsWithMetadataQuery(
  {
    workspaceId,
    documentUuid,
    draft,
    allowAnyDraft,
    page = '1',
    pageSize = '25',
  }: {
    workspaceId: number
    documentUuid?: string
    draft?: Commit
    allowAnyDraft?: boolean
    page?: string
    pageSize?: string
  },
  db = database,
) {
  const { scope } = getRepositoryScopes(workspaceId, db)
  const offset = calculateOffset(page, pageSize)
  const filteredSubQuery = db
    .select({
      id: scope.id,
      error: scope.error,
    })
    .from(scope)
    .innerJoin(commits, eq(commits.id, scope.commitId))
    .where(
      getCommonQueryConditions({ scope, documentUuid, draft, allowAnyDraft }),
    )
    .orderBy(desc(scope.createdAt))
    .limit(parseInt(pageSize))
    .offset(offset)
    .as('filteredDocumentLogsSubQuery')

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
    .innerJoin(filteredSubQuery, eq(filteredSubQuery.id, scope.id))
    .leftJoin(providerLogs, eq(providerLogs.documentLogUuid, scope.uuid))
    .groupBy(scope.id)
    .as('aggregatedFieldsSubQuery')

  return {
    scope,
    baseQuery: db
      .select({
        ...scope._.selectedFields,
        commit: getTableColumns(commits),
        tokens: aggregatedFieldsSubQuery.tokens,
        duration: aggregatedFieldsSubQuery.duration,
        costInMillicents: aggregatedFieldsSubQuery.costInMillicents,
      })
      .from(scope)
      .innerJoin(commits, eq(commits.id, scope.commitId))
      .innerJoin(
        aggregatedFieldsSubQuery,
        eq(aggregatedFieldsSubQuery.id, scope.id),
      )
      .orderBy(desc(scope.createdAt)),
  }
}

export async function computeDocumentLogsWithMetadataCount(
  {
    workspaceId,
    documentUuid,
    draft,
  }: {
    workspaceId: number
    documentUuid: string
    draft?: Commit
  },
  db = database,
) {
  const { scope } = getRepositoryScopes(workspaceId, db)

  const countList = await db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(scope)
    .innerJoin(commits, eq(commits.id, scope.commitId))
    .where(getCommonQueryConditions({ scope, documentUuid, draft }))

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}
