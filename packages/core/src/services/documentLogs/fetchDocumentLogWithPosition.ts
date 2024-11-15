import { and, eq, isNull, sql } from 'drizzle-orm'

import { Commit, DEFAULT_PAGINATION_SIZE, Workspace } from '../../browser'
import { Database, database } from '../../client'
import { Result } from '../../lib'
import {
  DocumentLogsRepository,
  DocumentLogsWithErrorsRepository,
} from '../../repositories'
import { commits, documentLogs } from '../../schema'
import { getCommonQueryConditions } from './computeDocumentLogsWithMetadata'
import { fetchDocumentLogWithMetadata } from './fetchDocumentLogWithMetadata'

function getRepo({
  workspaceId,
  db,
  excludeErrors,
}: {
  workspaceId: number
  excludeErrors: boolean
  db: Database
}) {
  const Klass = excludeErrors
    ? DocumentLogsRepository
    : DocumentLogsWithErrorsRepository
  return new Klass(workspaceId, db)
}

export async function fetchDocumentLogWithPosition(
  {
    workspace,
    commit,
    documentLogUuid,
    excludeErrors = false,
  }: {
    workspace: Workspace
    commit: Commit
    documentLogUuid: string | undefined
    excludeErrors?: boolean
  },
  db = database,
) {
  const log = await fetchDocumentLogWithMetadata({
    workspaceId: workspace.id,
    documentLogUuid,
  }).then((r) => r.unwrap())

  const targetCreatedAtUTC = new Date(log.createdAt).toISOString()
  const documentUuid = log.documentUuid

  const repo = getRepo({ workspaceId: workspace.id, db, excludeErrors })
  const scope = repo.scope.as('document_logs')
  const result = await db
    .select({
      count: sql`COUNT(*)`.mapWith(Number).as('count'),
    })
    .from(scope)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, scope.commitId)),
    )
    .where(
      and(
        sql`${scope.createdAt} >= ${targetCreatedAtUTC}`,
        getCommonQueryConditions({
          scope: documentLogs,
          documentUuid,
          draft: commit,
          allowAnyDraft: false,
        }),
      ),
    )

  const position = Number(result[0]?.count)
  const page = Math.ceil(position / DEFAULT_PAGINATION_SIZE)
  return Result.ok({ position, page })
}
