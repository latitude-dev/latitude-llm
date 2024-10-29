import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../repositories/documentLogsWithMetadataAndErrorsRepository'
import { commits, documentLogs, projects, workspaces } from '../../schema'

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
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspaceId, db)
  const offset = calculateOffset(page, pageSize)
  return repo.scope
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
