import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  sum,
} from 'drizzle-orm'

import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'
import {
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
  ErrorableEntity,
} from '../../constants'
import { database } from '../../client'
import { commits } from '../../schema/models/commits'
import { documentLogs } from '../../schema/models/documentLogs'
import { projects } from '../../schema/models/projects'
import { providerLogs } from '../../schema/models/providerLogs'
import { runErrors } from '../../schema/models/runErrors'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'
import { findDocumentLogs } from './data-access/findDocumentLogs'

export function getCommitFilter(draft?: Commit) {
  return draft
    ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
    : isNotNull(commits.mergedAt)
}

export async function computeDocumentLogsWithMetadata(
  {
    document,
    projectId,
    workspaceId,
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
    filterOptions,
  }: {
    document?: DocumentVersion
    projectId?: number
    workspaceId?: number
    page?: string
    pageSize?: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const logs = await findDocumentLogs({
    document,
    projectId,
    workspaceId,
    page,
    pageSize,
    filterOptions,
  })

  const providerLogAggregations = await db
    .select({
      documentLogUuid: providerLogs.documentLogUuid,
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      duration: sum(providerLogs.duration).mapWith(Number).as('duration_in_ms'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(providerLogs)
    .where(
      and(
        inArray(
          providerLogs.documentLogUuid,
          logs.map((l) => l.uuid),
        ),
      ),
    )
    .groupBy(providerLogs.documentLogUuid)
  const errors = await db
    .select({
      code: sql<string>`${runErrors.code}`,
      message: sql<string>`${runErrors.message}`,
      details: sql<string>`${runErrors.details}`,
      documentLogUuid: runErrors.errorableUuid,
    })
    .from(runErrors)
    .where(
      and(
        inArray(
          runErrors.errorableUuid,
          logs.map((l) => l.uuid),
        ),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )

  return logs.map((log) => {
    return {
      ...log,
      tokens:
        providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
          ?.tokens ?? 0,
      duration:
        providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
          ?.duration ?? 0,
      costInMillicents:
        providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
          ?.costInMillicents ?? 0,
      error: errors.find((e) => e.documentLogUuid === log.uuid) || {
        code: null,
        message: null,
        details: null,
      },
    }
  })
}

export async function computeDocumentLogsWithMetadataCount(
  {
    document,
    projectId,
    workspaceId,
    filterOptions,
  }: {
    document?: DocumentVersion
    projectId?: number
    workspaceId?: number
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    document ? eq(documentLogs.documentUuid, document.documentUuid) : undefined,
    projectId ? eq(commits.projectId, projectId) : undefined,
    workspaceId ? eq(documentLogs.workspaceId, workspaceId) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  const countList = await db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(and(...conditions))

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}

export async function computeDocumentLogsWithMetadataCountBySource(
  {
    document,
    projectId,
    workspaceId,
    filterOptions,
  }: {
    document?: DocumentVersion
    projectId?: number
    workspaceId?: number
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    document ? eq(documentLogs.documentUuid, document.documentUuid) : undefined,
    projectId ? eq(commits.projectId, projectId) : undefined,
    workspaceId ? eq(documentLogs.workspaceId, workspaceId) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  const countList = await db
    .select({
      source: documentLogs.source,
      count: sql`count(*)`.mapWith(Number).as('count'),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(and(...conditions))
    .groupBy(documentLogs.source)

  return countList
}

export async function computeDocumentLogsLimited(
  {
    document,
    from,
    filters,
  }: {
    document: DocumentVersion
    from: Cursor<string, number> | null
    filters: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    isNull(commits.deletedAt),
    eq(documentLogs.documentUuid, document.documentUuid),
    filters ? buildLogsFilterSQLConditions(filters) : undefined,
    from
      ? sql`(${documentLogs.createdAt}, ${documentLogs.id}) < (${from.value}, ${from.id})`
      : undefined,
  ].filter(Boolean)

  // Note: ordering is hardcoded, so custom identifier filter accuracy is degraded

  const logs = await db
    .select({
      ...getTableColumns(documentLogs),
      commit: getTableColumns(commits),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(and(...conditions))
    .orderBy(desc(documentLogs.createdAt), desc(documentLogs.id))
    .limit(DEFAULT_PAGINATION_SIZE)

  const providerLogAggregations = await db
    .select({
      documentLogUuid: providerLogs.documentLogUuid,
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      duration: sum(providerLogs.duration).mapWith(Number).as('duration_in_ms'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(providerLogs)
    .where(
      and(
        inArray(
          providerLogs.documentLogUuid,
          logs.map((l) => l.uuid),
        ),
      ),
    )
    .groupBy(providerLogs.documentLogUuid)

  const errors = await db
    .select({
      code: sql<string>`${runErrors.code}`,
      message: sql<string>`${runErrors.message}`,
      details: sql<string>`${runErrors.details}`,
      documentLogUuid: runErrors.errorableUuid,
    })
    .from(runErrors)
    .where(
      and(
        inArray(
          runErrors.errorableUuid,
          logs.map((l) => l.uuid),
        ),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )

  const items = logs.map((log) => {
    return {
      ...log,
      tokens:
        providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
          ?.tokens ?? 0,
      duration:
        providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
          ?.duration ?? 0,
      costInMillicents:
        providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
          ?.costInMillicents ?? 0,
      error: errors.find((e) => e.documentLogUuid === log.uuid) || {
        code: null,
        message: null,
        details: null,
      },
    }
  })

  let next = null
  if (logs.length === DEFAULT_PAGINATION_SIZE) {
    next = {
      value: logs[logs.length - 1]!.createdAt.toISOString(),
      id: logs[logs.length - 1]!.id,
    } as Cursor<string, number>
  }

  return { items, next }
}

export async function computeDocumentLogLimitedCursor(
  {
    workspace,
    logUuid,
    filters,
  }: {
    workspace: Workspace
    logUuid: string
    filters: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    isNull(commits.deletedAt),
    eq(projects.workspaceId, workspace.id),
    eq(documentLogs.uuid, logUuid),
    filters ? buildLogsFilterSQLConditions(filters) : undefined,
  ].filter(Boolean)

  const result = await db
    .select({
      value: sql<string>`to_char(${documentLogs.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      id: documentLogs.id,
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .where(and(...conditions))
    .then((r) => r[0])

  return result ?? null
}
