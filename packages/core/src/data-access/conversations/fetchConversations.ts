import {
  and,
  between,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  SQL,
} from 'drizzle-orm'
import { SpanType } from '@latitude-data/constants'
import { database } from '../../client'
import { DEFAULT_PAGINATION_SIZE } from '../../constants'
import { Result } from '../../lib/Result'
import { spans } from '../../schema/models/spans'
import { Workspace } from '../../schema/models/types/Workspace'
import {
  applyDefaultSpansCreatedAtRange,
  CreatedAtRange,
  normalizeCreatedAtRange,
  shouldFallbackToAllTime,
} from '../../services/spans/defaultCreatedAtWindow'
import { isClickHouseSpansReadEnabled } from '../../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import { fetchConversations as chFetchConversations } from '../../queries/clickhouse/spans/fetchConversations'

/** Span types that start a conversation (initiators). Only these types are included in the list. */
const CONVERSATION_INITIATOR_SPAN_TYPES = [
  SpanType.Prompt,
  SpanType.External,
] as const

export type ConversationFilters = {
  commitUuids: string[]
  experimentUuids?: string[]
  testDeploymentIds?: number[]
  createdAt?: CreatedAtRange
}

export type FetchConversationsParams = {
  workspace: Workspace
  projectId: number
  documentUuid: string
  filters: ConversationFilters
  from?: { startedAt: string; documentLogUuid: string }
  limit?: number
}

type ConversationQueryResult = Awaited<
  ReturnType<typeof fetchConversationsQuery>
>

export type ConversationListItem = ConversationQueryResult['items'][0]
export type FetchConversationsResult = {
  items: ConversationListItem[]
  next: ConversationQueryResult['next']
  didFallbackToAllTime?: boolean
}

function buildInitiatorConditions({
  workspaceId,
  documentUuid,
  commitUuids,
  experimentUuids,
  testDeploymentIds,
}: {
  workspaceId: number
  documentUuid: string
  commitUuids: string[]
  experimentUuids?: string[]
  testDeploymentIds?: number[]
}): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(spans.workspaceId, workspaceId),
    eq(spans.documentUuid, documentUuid),
    inArray(spans.commitUuid, commitUuids),
    inArray(spans.type, CONVERSATION_INITIATOR_SPAN_TYPES),
    sql`${spans.documentLogUuid} IS NOT NULL`,
    sql`${spans.parentId} IS NULL`, // only root spans (no parent)
  ]
  if (experimentUuids && experimentUuids.length > 0) {
    conditions.push(inArray(spans.experimentUuid, experimentUuids))
  }
  if (testDeploymentIds && testDeploymentIds.length > 0) {
    conditions.push(inArray(spans.testDeploymentId, testDeploymentIds))
  }
  return conditions
}

function buildCreatedAtCondition(createdAt?: CreatedAtRange): SQL<unknown>[] {
  if (!createdAt) return []

  if (createdAt.from && createdAt.to) {
    return [between(spans.startedAt, createdAt.from, createdAt.to)]
  } else if (createdAt.from) {
    return [gte(spans.startedAt, createdAt.from)]
  } else if (createdAt.to) {
    return [lte(spans.startedAt, createdAt.to)]
  }

  return []
}

async function fetchConversationsQuery(
  {
    workspaceId,
    documentUuid,
    commitUuids,
    experimentUuids,
    testDeploymentIds,
    createdAt,
    from,
    limit,
  }: {
    workspaceId: number
    documentUuid: string
    commitUuids: string[]
    experimentUuids?: string[]
    testDeploymentIds?: number[]
    createdAt?: CreatedAtRange
    from?: { startedAt: string; documentLogUuid: string }
    limit: number
  },
  db = database,
) {
  const initiatorConditions = buildInitiatorConditions({
    workspaceId,
    documentUuid,
    commitUuids,
    experimentUuids,
    testDeploymentIds,
  })

  const createdAtConditions = buildCreatedAtCondition(createdAt)

  const cursorCondition = from
    ? sql`(${spans.startedAt}, ${spans.documentLogUuid}) < (${from.startedAt}, ${from.documentLogUuid})`
    : undefined

  const initiatorQueryConditions = [
    ...initiatorConditions,
    ...createdAtConditions,
    cursorCondition,
  ].filter(Boolean) as SQL<unknown>[]

  const rows = await db
    .select({
      documentLogUuid: spans.documentLogUuid,
      startedAt:
        sql<string>`to_char(${spans.startedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          'started_at',
        ),
      endedAt:
        sql<string>`to_char(${spans.endedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          'ended_at',
        ),
      totalDuration: sql<number>`COALESCE(${spans.duration}, 0)`.as(
        'total_duration',
      ),
      source: spans.source,
      commitUuid: sql<string>`COALESCE(${spans.commitUuid}::text, '')`.as(
        'commit_uuid',
      ),
      experimentUuid: spans.experimentUuid,
    })
    .from(spans)
    .where(and(...initiatorQueryConditions))
    .orderBy(desc(spans.startedAt), desc(spans.documentLogUuid))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows

  if (items.length === 0) {
    return { items: [], next: null }
  }

  const lastItem = items[items.length - 1]
  const next =
    hasMore && lastItem
      ? {
          startedAt: lastItem.startedAt,
          documentLogUuid: lastItem.documentLogUuid!,
        }
      : null

  return { items, next }
}

/**
 * Returns a paginated list of conversation list items for a document.
 * Only includes initiator spans: those with type Prompt or External.
 * Only includes root spans: those with no parent_id (top-level spans that start a trace).
 * Uses PostgreSQL or ClickHouse depending on workspace feature flags.
 */
export async function fetchConversations(
  {
    workspace,
    projectId,
    documentUuid,
    filters,
    from,
    limit = DEFAULT_PAGINATION_SIZE,
  }: FetchConversationsParams,
  db = database,
) {
  const shouldUseClickHouse = await isClickHouseSpansReadEnabled(
    workspace.id,
    db,
  )
  const normalizedCreatedAt = normalizeCreatedAtRange(filters.createdAt)

  if (shouldUseClickHouse) {
    const defaultCreatedAt = applyDefaultSpansCreatedAtRange({
      createdAt: normalizedCreatedAt,
      hasCursor: Boolean(from),
    })

    const queryParams = {
      workspaceId: workspace.id,
      projectId,
      documentUuid,
      filters,
      from,
      limit,
    }

    const firstPage = await chFetchConversations({
      ...queryParams,
      createdAt: defaultCreatedAt,
    })

    if (
      !shouldFallbackToAllTime({
        hasCursor: Boolean(from),
        normalizedCreatedAt,
        itemCount: firstPage.items.length,
      })
    ) {
      return Result.ok<FetchConversationsResult>({
        ...firstPage,
        didFallbackToAllTime: undefined,
      })
    }

    const allTime = await chFetchConversations({
      ...queryParams,
      createdAt: undefined,
    })

    return Result.ok<FetchConversationsResult>({
      ...allTime,
      didFallbackToAllTime: true,
    })
  }

  const defaultCreatedAt = applyDefaultSpansCreatedAtRange({
    createdAt: normalizedCreatedAt,
    hasCursor: Boolean(from),
  })

  const queryParams = {
    workspaceId: workspace.id,
    documentUuid,
    commitUuids: filters.commitUuids,
    experimentUuids: filters.experimentUuids,
    testDeploymentIds: filters.testDeploymentIds,
    from,
    limit,
  }

  const firstPage = await fetchConversationsQuery(
    { ...queryParams, createdAt: defaultCreatedAt },
    db,
  )

  if (
    !shouldFallbackToAllTime({
      hasCursor: Boolean(from),
      normalizedCreatedAt,
      itemCount: firstPage.items.length,
    })
  ) {
    return Result.ok<FetchConversationsResult>({
      ...firstPage,
      didFallbackToAllTime: undefined,
    })
  }

  const allTime = await fetchConversationsQuery(
    { ...queryParams, createdAt: undefined },
    db,
  )

  return Result.ok<FetchConversationsResult>({
    ...allTime,
    didFallbackToAllTime: true,
  })
}
