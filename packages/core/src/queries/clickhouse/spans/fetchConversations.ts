import { LogSources, SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { CreatedAtRange } from '../../../services/spans/defaultCreatedAtWindow'
import { scopedQuery } from '../../scope'

const MAIN_SPAN_TYPE_VALUES = [
  SpanType.Prompt,
  SpanType.Chat,
  SpanType.External,
]

export type ConversationFilters = {
  commitUuids: string[]
  experimentUuids?: string[]
  testDeploymentIds?: number[]
  createdAt?: CreatedAtRange
}

export type FetchConversationsParams = {
  workspaceId: number
  projectId: number
  documentUuid: string
  filters: ConversationFilters
  from?: { startedAt: string; documentLogUuid: string }
  limit?: number
  createdAt?: CreatedAtRange
}

export type ConversationItem = {
  documentLogUuid: string | null
  traceIds: string[]
  traceCount: number
  totalTokens: number
  totalDuration: number
  totalCost: number
  startedAt: string
  endedAt: string
  latestStartedAt: string
  source: LogSources | null
  commitUuid: string
  experimentUuid: string | null
}

export type FetchConversationsResult = {
  items: ConversationItem[]
  next: { startedAt: string; documentLogUuid: string } | null
  didFallbackToAllTime?: boolean
}

export const fetchConversations = scopedQuery(async function fetchConversations(
  {
    workspaceId,
    projectId,
    documentUuid,
    filters,
    from,
    limit = 25,
    createdAt,
  }: FetchConversationsParams,
): Promise<FetchConversationsResult> {
  const effectiveCreatedAt = createdAt ?? filters.createdAt
  const params: Record<string, unknown> = {
    workspaceId,
    projectId,
    documentUuid,
    commitUuids: filters.commitUuids,
    mainSpanTypes: MAIN_SPAN_TYPE_VALUES,
    limit: limit + 1,
  }

  const conditions = [
    `workspace_id = {workspaceId: UInt64}`,
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    `project_id = {projectId: UInt64}`,
    `project_id_key = {projectId: UInt64}`,
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    `document_uuid = {documentUuid: UUID}`,
    `document_uuid_key = {documentUuid: UUID}`,
    // TODO(clickhouse): remove non-_key predicate after key-column rollout.
    `commit_uuid IN ({commitUuids: Array(UUID)})`,
    `commit_uuid_key IN ({commitUuids: Array(UUID)})`,
    `type IN ({mainSpanTypes: Array(String)})`,
    `document_log_uuid IS NOT NULL`,
  ]

  if (filters.experimentUuids && filters.experimentUuids.length > 0) {
    params.experimentUuids = filters.experimentUuids
    conditions.push(`experiment_uuid IN ({experimentUuids: Array(UUID)})`)
  }

  if (filters.testDeploymentIds && filters.testDeploymentIds.length > 0) {
    params.testDeploymentIds = filters.testDeploymentIds
    conditions.push(
      `test_deployment_id IN ({testDeploymentIds: Array(UInt64)})`,
    )
  }

  if (effectiveCreatedAt?.from) {
    params.createdAtFrom = toClickHouseDateTime(effectiveCreatedAt.from)
    conditions.push(`started_at >= {createdAtFrom: DateTime64(6, 'UTC')}`)
  }

  if (effectiveCreatedAt?.to) {
    params.createdAtTo = toClickHouseDateTime(effectiveCreatedAt.to)
    conditions.push(`started_at <= {createdAtTo: DateTime64(6, 'UTC')}`)
  }

  if (from) {
    params.cursorStartedAt = from.startedAt.includes('T')
      ? toClickHouseDateTime(from.startedAt)
      : from.startedAt
    params.cursorDocumentLogUuid = from.documentLogUuid
    conditions.push(
      `(started_at, document_log_uuid) < ({cursorStartedAt: DateTime64(6, 'UTC')}, {cursorDocumentLogUuid: UUID})`,
    )
  }

  // Query for paginated document log UUIDs with aggregate data
  const result = await clickhouseClient().query({
    query: `
      SELECT
        document_log_uuid,
        groupArrayDistinct(trace_id) AS trace_ids,
        countDistinct(trace_id) AS trace_count,
        sum(
          coalesce(tokens_prompt, 0) +
          coalesce(tokens_cached, 0) +
          coalesce(tokens_reasoning, 0) +
          coalesce(tokens_completion, 0)
        ) AS total_tokens,
        sum(duration_ms) FILTER (WHERE type IN ('prompt', 'chat', 'external')) AS total_duration,
        sum(cost) AS total_cost,
        min(started_at) AS conversation_started_at,
        max(ended_at) AS conversation_ended_at,
        max(started_at) AS latest_started_at,
        anyLast(source) AS latest_source,
        anyLast(commit_uuid) AS latest_commit_uuid,
        anyLast(experiment_uuid) AS latest_experiment_uuid
      FROM ${TABLE_NAME}
      WHERE ${conditions.join(' AND ')}
      GROUP BY document_log_uuid
      ORDER BY latest_started_at DESC, document_log_uuid DESC
      LIMIT {limit: UInt32}
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await result.json<{
    document_log_uuid: string
    trace_ids: string[]
    trace_count: string
    total_tokens: string
    total_duration: string
    total_cost: string
    conversation_started_at: string
    conversation_ended_at: string
    latest_started_at: string
    latest_source: string
    latest_commit_uuid: string
    latest_experiment_uuid: string | null
  }>()

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows

  const conversations: ConversationItem[] = items.map((row) => ({
    documentLogUuid: row.document_log_uuid,
    traceIds: row.trace_ids,
    traceCount: Number(row.trace_count),
    totalTokens: Number(row.total_tokens),
    totalDuration: Number(row.total_duration),
    totalCost: Number(row.total_cost),
    startedAt: row.conversation_started_at,
    endedAt: row.conversation_ended_at,
    latestStartedAt: row.latest_started_at,
    source: row.latest_source as LogSources | null,
    commitUuid: row.latest_commit_uuid,
    experimentUuid: row.latest_experiment_uuid,
  }))

  const lastItem = items.length > 0 ? items[items.length - 1] : null
  const next =
    hasMore && lastItem
      ? {
          startedAt: lastItem.latest_started_at,
          documentLogUuid: lastItem.document_log_uuid,
        }
      : null

  return { items: conversations, next, didFallbackToAllTime: undefined }
})
