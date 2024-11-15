import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { Commit, DEFAULT_PAGINATION_SIZE, ErrorableEntity } from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { DocumentLogsRepository } from '../../repositories'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../schema'
import { getCommonQueryConditions } from './computeDocumentLogsWithMetadata'

export function computeDocumentLogsQuery(
  {
    workspaceId,
    documentUuid,
    draft,
    allowAnyDraft,
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
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
  const repo = new DocumentLogsRepository(workspaceId, db)
  const offset = calculateOffset(page, pageSize)
  const scope = repo.scope.as('document_logs')
  const fields = scope._.selectedFields
  return db
    .select(fields)
    .from(scope)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, scope.commitId)),
    )
    .where(
      and(
        getCommonQueryConditions({
          scope: documentLogs,
          documentUuid,
          draft,
          allowAnyDraft,
        }),
      ),
    )
    .orderBy(desc(documentLogs.createdAt))
    .limit(parseInt(pageSize))
    .offset(offset)
}

export async function computeDocumentLogsCount(
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
  const repo = new DocumentLogsRepository(workspaceId, db)
  const scope = repo.scope.as('document_logs')
  const countList = await db
    .select({
      count: sql`count(*)`.mapWith(Number).as('total_count'),
    })
    .from(scope)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, scope.commitId)),
    )
    .where(
      getCommonQueryConditions({ scope: documentLogs, documentUuid, draft }),
    )

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}
