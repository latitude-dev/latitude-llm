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
import { database } from '../../client'
import { DEFAULT_PAGINATION_SIZE, MAIN_SPAN_TYPES } from '../../constants'
import { Result } from '../../lib/Result'
import { spans } from '../../schema/models/spans'
import { Workspace } from '../../schema/models/types/Workspace'
import {
  applyDefaultSpansCreatedAtRange,
  CreatedAtRange,
  normalizeCreatedAtRange,
  shouldFallbackToAllTime,
} from '../../services/spans/defaultCreatedAtWindow'
import { conversationAggregateFields } from './shared'
import { isClickHouseSpansReadEnabled } from '../../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import { fetchConversations as chFetchConversations } from '../../queries/clickhouse/spans/fetchConversations'

export type ConversationFilters = {
  commitUuids: string[]
  experimentUuids?: string[]
  testDeploymentIds?: number[]
  createdAt?: CreatedAtRange
}

export type FetchConversationsParams = {
  workspace: Workspace
  documentUuid: string
  filters: ConversationFilters
  from?: { startedAt: string; documentLogUuid: string }
  limit?: number
}

type ConversationQueryResult = Awaited<
  ReturnType<typeof fetchConversationsQuery>
>

export type FetchConversationsResult = {
  items: ConversationQueryResult['items']
  next: ConversationQueryResult['next']
  didFallbackToAllTime?: boolean
}

function buildBaseConditions({
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
    inArray(spans.type, Array.from(MAIN_SPAN_TYPES)),
    sql`${spans.documentLogUuid} IS NOT NULL`,
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
  const baseConditions = buildBaseConditions({
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

  const allConditions = [
    ...baseConditions,
    ...createdAtConditions,
    cursorCondition,
  ].filter(Boolean) as SQL<unknown>[]

  const paginatedUuids = await db
    .select({
      documentLogUuid: spans.documentLogUuid,
      latestStartedAt: sql<string>`MAX(${spans.startedAt})`.as(
        'latest_started_at',
      ),
    })
    .from(spans)
    .where(and(...allConditions))
    .groupBy(spans.documentLogUuid)
    .orderBy(desc(sql`MAX(${spans.startedAt})`), desc(spans.documentLogUuid))
    .limit(limit + 1)

  const hasMore = paginatedUuids.length > limit
  const pageUuids = hasMore ? paginatedUuids.slice(0, limit) : paginatedUuids

  if (pageUuids.length === 0) {
    return { items: [], next: null }
  }

  const uuidList = pageUuids.map((r) => r.documentLogUuid!)

  const result = await db
    .select(conversationAggregateFields)
    .from(spans)
    .where(and(...baseConditions, inArray(spans.documentLogUuid, uuidList)))
    .groupBy(spans.documentLogUuid)
    .orderBy(desc(sql`MAX(${spans.startedAt})`), desc(spans.documentLogUuid))

  const lastItem = pageUuids.length > 0 ? pageUuids[pageUuids.length - 1] : null
  const next =
    hasMore && lastItem
      ? {
          startedAt: lastItem.latestStartedAt,
          documentLogUuid: lastItem.documentLogUuid!,
        }
      : null

  return { items: result, next }
}

export async function fetchConversations(
  {
    workspace,
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

  if (shouldUseClickHouse) {
    const normalizedCreatedAt = normalizeCreatedAtRange(filters.createdAt)
    const defaultCreatedAt = applyDefaultSpansCreatedAtRange({
      createdAt: normalizedCreatedAt,
      hasCursor: Boolean(from),
    })

    const queryParams = {
      workspaceId: workspace.id,
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

  const normalizedCreatedAt = normalizeCreatedAtRange(filters.createdAt)
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
