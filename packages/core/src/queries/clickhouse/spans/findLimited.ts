import { LogSources, Span, SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import {
  applyDefaultSpansCreatedAtRange,
  CreatedAtRange,
  normalizeCreatedAtRange,
  shouldFallbackToAllTime,
} from '../../../services/spans/defaultCreatedAtWindow'
import { scopedQuery } from '../../scope'
import { spanRowToSpan } from './toSpan'

type LimitedQueryParams = {
  workspaceId: number
  from?: { startedAt: string; id: string }
  limit: number
}

type FilterParams = {
  types?: SpanType[]
  source?: LogSources[]
  experimentUuids?: string[]
  createdAt?: CreatedAtRange
}

function buildWhereClause(
  baseConditions: string[],
  baseParams: Record<string, unknown>,
  filters: FilterParams,
  from?: { startedAt: string; id: string },
): { where: string; params: Record<string, unknown> } {
  const conditions = [...baseConditions]
  const params: Record<string, unknown> = { ...baseParams }

  if (filters.types && filters.types.length > 0) {
    conditions.push(`type IN ({types: Array(String)})`)
    params.types = filters.types
  }

  if (filters.source && filters.source.length > 0) {
    conditions.push(`(source IN ({sources: Array(String)}) OR source IS NULL)`)
    params.sources = filters.source
  }

  if (filters.experimentUuids && filters.experimentUuids.length > 0) {
    conditions.push(`experiment_uuid IN ({experimentUuids: Array(UUID)})`)
    params.experimentUuids = filters.experimentUuids
  }

  if (filters.createdAt?.from && filters.createdAt?.to) {
    conditions.push(
      `started_at >= {createdAtFrom: DateTime64(6, 'UTC')} AND started_at <= {createdAtTo: DateTime64(6, 'UTC')}`,
    )
    params.createdAtFrom = toClickHouseDateTime(filters.createdAt.from)
    params.createdAtTo = toClickHouseDateTime(filters.createdAt.to)
  } else if (filters.createdAt?.from) {
    conditions.push(`started_at >= {createdAtFrom: DateTime64(6, 'UTC')}`)
    params.createdAtFrom = toClickHouseDateTime(filters.createdAt.from)
  } else if (filters.createdAt?.to) {
    conditions.push(`started_at <= {createdAtTo: DateTime64(6, 'UTC')}`)
    params.createdAtTo = toClickHouseDateTime(filters.createdAt.to)
  }

  if (from) {
    conditions.push(
      `(started_at, span_id) < ({cursorStartedAt: DateTime64(6, 'UTC')}, {cursorId: String})`,
    )
    params.cursorStartedAt = toClickHouseDateTime(new Date(from.startedAt))
    params.cursorId = from.id
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

const executeLimitedQuery = scopedQuery(async function executeLimitedQuery(
  {
    workspaceId,
    baseConditions,
    baseParams,
    filters,
    from,
    limit,
  }: LimitedQueryParams & {
    baseConditions: string[]
    baseParams: Record<string, unknown>
    filters: FilterParams
  },
  _db,
): Promise<{ items: Span[]; next: { startedAt: string; id: string } | null }> {
  const { where, params } = buildWhereClause(
    baseConditions,
    baseParams,
    filters,
    from,
  )

  const result = await clickhouseClient().query({
    query: `
        SELECT *
        FROM ${SPANS_TABLE}
        ${where}
        ORDER BY started_at DESC, span_id DESC
        LIMIT {fetchLimit: UInt32}
      `,
    format: 'JSONEachRow',
    query_params: { workspaceId, ...params, fetchLimit: limit + 1 },
  })

  const rows = await result.json<SpanRow>()
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const spans = items.map(spanRowToSpan)

  const next =
    hasMore && spans.length > 0
      ? {
          startedAt: spans[spans.length - 1]!.startedAt.toISOString(),
          id: spans[spans.length - 1]!.id,
        }
      : null

  return { items: spans, next }
})

async function executeWithDefaultCreatedAtAndFallback({
  workspaceId,
  baseConditions,
  baseParams,
  filters,
  from,
  limit,
}: LimitedQueryParams & {
  baseConditions: string[]
  baseParams: Record<string, unknown>
  filters: FilterParams
}): Promise<{
  items: Span[]
  next: { startedAt: string; id: string } | null
  didFallbackToAllTime?: true
}> {
  const normalizedCreatedAt = normalizeCreatedAtRange(filters.createdAt)
  const defaultCreatedAt = applyDefaultSpansCreatedAtRange({
    createdAt: normalizedCreatedAt,
    hasCursor: Boolean(from),
  })

  const firstPage = await executeLimitedQuery({
    workspaceId,
    baseConditions,
    baseParams,
    filters: { ...filters, createdAt: defaultCreatedAt },
    from,
    limit,
  })

  if (
    !shouldFallbackToAllTime({
      hasCursor: Boolean(from),
      normalizedCreatedAt,
      itemCount: firstPage.items.length,
    })
  ) {
    return { ...firstPage, didFallbackToAllTime: undefined }
  }

  const allTime = await executeLimitedQuery({
    workspaceId,
    baseConditions,
    baseParams,
    filters: { ...filters, createdAt: undefined },
    from: undefined,
    limit,
  })

  return { ...allTime, didFallbackToAllTime: true }
}

export const findByDocumentAndCommitLimited = scopedQuery(
  async function findByDocumentAndCommitLimited(
    {
      workspaceId,
      documentUuid,
      types,
      from,
      limit,
      commitUuids,
      experimentUuids,
      source,
      testDeploymentIds,
      createdAt,
    }: {
      workspaceId: number
      documentUuid: string
      types?: SpanType[]
      from?: { startedAt: string; id: string }
      limit: number
      commitUuids?: string[]
      experimentUuids?: string[]
      source?: LogSources[]
      testDeploymentIds?: number[]
      createdAt?: CreatedAtRange
    },
    _db,
  ) {
    const baseConditions = [
      `workspace_id = {workspaceId: UInt64}`,
      `document_uuid = {documentUuid: UUID}`,
    ]
    const baseParams: Record<string, unknown> = { workspaceId, documentUuid }

    if (commitUuids && commitUuids.length > 0) {
      baseConditions.push(`commit_uuid IN ({commitUuids: Array(UUID)})`)
      baseParams.commitUuids = commitUuids
    }

    if (testDeploymentIds && testDeploymentIds.length > 0) {
      baseConditions.push(
        `test_deployment_id IN ({testDeploymentIds: Array(UInt64)})`,
      )
      baseParams.testDeploymentIds = testDeploymentIds
    }

    return executeWithDefaultCreatedAtAndFallback({
      workspaceId,
      baseConditions,
      baseParams,
      filters: { types, source, experimentUuids, createdAt },
      from,
      limit,
    })
  },
)

export const findByProjectLimited = scopedQuery(
  async function findByProjectLimited(
    {
      workspaceId,
      projectId,
      types,
      from,
      source,
      limit,
      experimentUuids,
      createdAt,
    }: {
      workspaceId: number
      projectId: number
      types?: SpanType[]
      from?: { startedAt: string; id: string }
      source?: LogSources[]
      limit: number
      experimentUuids?: string[]
      createdAt?: CreatedAtRange
    },
    _db,
  ) {
    const baseConditions = [
      `workspace_id = {workspaceId: UInt64}`,
      `project_id = {projectId: UInt64}`,
    ]
    const baseParams: Record<string, unknown> = { workspaceId, projectId }

    return executeWithDefaultCreatedAtAndFallback({
      workspaceId,
      baseConditions,
      baseParams,
      filters: { types, source, experimentUuids, createdAt },
      from,
      limit,
    })
  },
)
