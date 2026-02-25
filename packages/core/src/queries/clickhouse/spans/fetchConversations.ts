import { LogSources, SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { CreatedAtRange } from '../../../services/spans/defaultCreatedAtWindow'
import { scopedQuery } from '../../scope'
import { ConversationListItem } from '../../../data-access/conversations/fetchConversations'

const CONVERSATION_INITIATOR_SPAN_TYPES = [SpanType.Prompt, SpanType.External]

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

export type FetchConversationsResult = {
  items: ConversationListItem[]
  next: { startedAt: string; documentLogUuid: string } | null
  didFallbackToAllTime?: boolean
}

export const fetchConversations = scopedQuery(
  async function fetchConversations({
    workspaceId,
    projectId,
    documentUuid,
    filters,
    from,
    limit = 25,
    createdAt,
  }: FetchConversationsParams): Promise<FetchConversationsResult> {
    const effectiveCreatedAt = createdAt ?? filters.createdAt
    const params: Record<string, unknown> = {
      workspaceId,
      projectId,
      documentUuid,
      commitUuids: filters.commitUuids,
      initiatorSpanTypes: CONVERSATION_INITIATOR_SPAN_TYPES,
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
      `type IN ({initiatorSpanTypes: Array(String)})`,
      `document_log_uuid IS NOT NULL`,
      `parent_id IS NULL`,
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

    const result = await clickhouseClient().query({
      query: `
      SELECT
        document_log_uuid,
        started_at,
        ended_at,
        duration_ms,
        source,
        commit_uuid,
        experiment_uuid
      FROM ${TABLE_NAME}
      WHERE ${conditions.join(' AND ')}
      ORDER BY started_at DESC, document_log_uuid DESC
      LIMIT {limit: UInt32}
    `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const rows = await result.json<{
      document_log_uuid: string
      started_at: string
      ended_at: string
      duration_ms: number
      source: string
      commit_uuid: string
      experiment_uuid: string | null
    }>()

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    const conversations: ConversationListItem[] = items.map((row) => ({
      documentLogUuid: row.document_log_uuid,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      totalDuration: row.duration_ms ?? 0,
      source: row.source as LogSources | null,
      commitUuid: row.commit_uuid,
      experimentUuid: row.experiment_uuid,
    }))

    const lastItem = items.length > 0 ? items[items.length - 1] : null
    const next =
      hasMore && lastItem
        ? {
            startedAt: lastItem.started_at,
            documentLogUuid: lastItem.document_log_uuid,
          }
        : null

    return { items: conversations, next, didFallbackToAllTime: undefined }
  },
)
