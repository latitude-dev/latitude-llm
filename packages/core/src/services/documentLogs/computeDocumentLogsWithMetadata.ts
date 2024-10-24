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
import { DocumentLogsWithErrorsRepository } from '../../repositories'
import {
  commits,
  documentLogs,
  projects,
  providerLogs,
  workspaces,
} from '../../schema'

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
  scope: any
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
  const filteredSubQuery = scope
    .where(
      getCommonQueryConditions({
        scope: documentLogs,
        documentUuid,
        draft,
        allowAnyDraft,
      }),
    )
    .orderBy(desc(documentLogs.createdAt))
    .limit(parseInt(pageSize))
    .offset(offset)
    .as('filteredDocumentLogsSubQuery')

  const aggregatedFieldsSubQuery = db
    .select({
      id: filteredSubQuery.id,
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      duration: sum(providerLogs.duration).mapWith(Number).as('duration_in_ms'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(filteredSubQuery)
    .leftJoin(
      providerLogs,
      eq(providerLogs.documentLogUuid, filteredSubQuery.uuid),
    )
    .groupBy(filteredSubQuery.id)
    .as('aggregatedFieldsSubQuery')

  return {
    scope,
    baseQuery: db
      .select({
        ...filteredSubQuery._.selectedFields,
        commit: getTableColumns(commits),
        tokens: aggregatedFieldsSubQuery.tokens,
        duration: aggregatedFieldsSubQuery.duration,
        costInMillicents: aggregatedFieldsSubQuery.costInMillicents,
      })
      .from(documentLogs)
      .innerJoin(filteredSubQuery, eq(filteredSubQuery.id, documentLogs.id))
      .innerJoin(commits, eq(commits.id, filteredSubQuery.commitId))
      .innerJoin(
        aggregatedFieldsSubQuery,
        eq(aggregatedFieldsSubQuery.id, filteredSubQuery.id),
      )
      .orderBy(desc(documentLogs.createdAt)),
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
  const countList = await db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .where(
      and(
        eq(workspaces.id, workspaceId),
        getCommonQueryConditions({ scope: documentLogs, documentUuid, draft }),
      ),
    )

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}
