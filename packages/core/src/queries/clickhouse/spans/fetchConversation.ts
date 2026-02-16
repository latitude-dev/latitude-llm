import { LogSources, SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'

const MAIN_SPAN_TYPE_VALUES = [
  SpanType.Prompt,
  SpanType.Chat,
  SpanType.External,
]

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

export async function fetchConversation({
  workspaceId,
  documentLogUuid,
  documentUuid,
}: {
  workspaceId: number
  documentLogUuid: string
  documentUuid?: string
}): Promise<ConversationItem | null> {
  const params: Record<string, unknown> = {
    workspaceId,
    documentLogUuid,
    mainSpanTypes: MAIN_SPAN_TYPE_VALUES,
  }

  const conditions = [
    `workspace_id = {workspaceId: UInt64}`,
    `document_log_uuid = {documentLogUuid: UUID}`,
    `type IN ({mainSpanTypes: Array(String)})`,
  ]

  if (documentUuid) {
    params.documentUuid = documentUuid
    conditions.push(`document_uuid = {documentUuid: UUID}`)
  }

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
      FROM ${SPANS_TABLE}
      WHERE ${conditions.join(' AND ')}
      GROUP BY document_log_uuid
      LIMIT 1
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

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]

  return {
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
  }
}
