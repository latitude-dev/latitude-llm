import { and, eq, isNull, sql } from 'drizzle-orm'

import {
  Commit,
  DEFAULT_PAGINATION_SIZE,
  ErrorableEntity,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../schema'
import { getCommonQueryConditions } from './computeDocumentLogsWithMetadata'
import { fetchDocumentLogWithMetadata } from './fetchDocumentLogWithMetadata'

type QueryArgs = {
  targetCreatedAtUTC: string
  documentUuid: string
  workspace: Workspace
  commit: Commit
}
async function getDocumentLogsQuery(
  { workspace, commit, documentUuid, targetCreatedAtUTC }: QueryArgs,
  db = database,
) {
  return db
    .select({
      count: sql`count(*)`.mapWith(Number).as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
    )
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )
    .where(
      and(
        isNull(runErrors.id),
        eq(workspaces.id, workspace.id),
        getCommonQueryConditions({
          scope: documentLogs,
          documentUuid,
          draft: commit,
          allowAnyDraft: false,
        }),
        sql`${documentLogs.createdAt} >= ${targetCreatedAtUTC}`,
      ),
    )
}

async function getDocumentLogsWithErrorsQuery(
  { workspace, commit, documentUuid, targetCreatedAtUTC }: QueryArgs,
  db = database,
) {
  return db
    .select({
      count: sql`count(*)`.mapWith(Number).as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(
      commits,
      and(eq(commits.id, documentLogs.commitId), isNull(commits.deletedAt)),
    )
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )
    .where(
      and(
        eq(workspaces.id, workspace.id),
        getCommonQueryConditions({
          scope: documentLogs,
          documentUuid,
          draft: commit,
          allowAnyDraft: false,
        }),
        sql`${documentLogs.createdAt} >= ${targetCreatedAtUTC}`,
      ),
    )
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

  const queryFn = excludeErrors
    ? getDocumentLogsQuery
    : getDocumentLogsWithErrorsQuery
  const result = await queryFn(
    {
      documentUuid,
      targetCreatedAtUTC,
      workspace,
      commit,
    },
    db,
  )

  const position = Number(result[0]?.count)
  const page = Math.ceil(position / DEFAULT_PAGINATION_SIZE)
  return Result.ok({ position, page })
}
