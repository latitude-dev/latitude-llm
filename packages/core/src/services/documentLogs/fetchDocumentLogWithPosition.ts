import { and, eq, isNull, sql } from 'drizzle-orm'

import {
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
  ErrorableEntity,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../schema'
import { fetchDocumentLogWithMetadata } from './fetchDocumentLogWithMetadata'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

type QueryArgs = {
  targetCreatedAtUTC: string
  documentUuid: string
  workspace: Workspace
  filterOptions?: DocumentLogFilterOptions
}
async function getDocumentLogsQuery(
  { workspace, filterOptions, documentUuid, targetCreatedAtUTC }: QueryArgs,
  db = database,
) {
  const conditions = [
    isNull(runErrors.id),
    eq(workspaces.id, workspace.id),
    sql`${documentLogs.createdAt} >= ${targetCreatedAtUTC}`,
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
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
    .where(and(...conditions))
}

async function getDocumentLogsWithErrorsQuery(
  { workspace, filterOptions, documentUuid, targetCreatedAtUTC }: QueryArgs,
  db = database,
) {
  const conditions = [
    eq(workspaces.id, workspace.id),
    sql`${documentLogs.createdAt} >= ${targetCreatedAtUTC}`,
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

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
    .where(and(...conditions))
}

export async function fetchDocumentLogWithPosition(
  {
    workspace,
    filterOptions,
    documentLogUuid,
    excludeErrors = false,
  }: {
    workspace: Workspace
    filterOptions?: DocumentLogFilterOptions
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
      filterOptions,
    },
    db,
  )

  const position = Number(result[0]?.count)
  const page = Math.ceil(position / DEFAULT_PAGINATION_SIZE)
  return Result.ok({ position, page })
}
