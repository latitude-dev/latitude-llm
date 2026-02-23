import { LogSources } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { scopedQuery } from '../../scope'

export type ConversationItem = {
  documentLogUuid: string | null
  documentUuid: string | null
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

export const fetchConversation = scopedQuery(async function fetchConversation({
  workspaceId,
  projectId,
  documentLogUuid,
  documentUuid,
  commitUuid,
}: {
  workspaceId: number
  projectId: number
  documentLogUuid: string
  documentUuid?: string
  commitUuid?: string
}): Promise<ConversationItem | null> {
  const params: Record<string, unknown> = {
    workspaceId,
    projectId,
    documentLogUuid,
  }

  const conditions = [
    `workspace_id = {workspaceId: UInt64}`,
    `project_id_key = {projectId: UInt64}`,
    `document_log_uuid = {documentLogUuid: UUID}`,
  ]

  if (documentUuid) {
    params.documentUuid = documentUuid
    conditions.push(`document_uuid_key = {documentUuid: UUID}`)
  }

  if (commitUuid) {
    conditions.push(`commit_uuid_key = {commitUuid: UUID}`)
    params.commitUuid = commitUuid
  }

  const whereClause = conditions.join(' AND ')

  const result = await clickhouseClient().query({
    query: `
      SELECT
        document_log_uuid,
        groupArray(trace_id) AS trace_ids,
        count() AS trace_count,
        sum(trace_tokens) AS total_tokens,
        sum(trace_duration) AS total_duration,
        sum(trace_cost) AS total_cost,
        min(trace_started_at) AS conversation_started_at,
        max(trace_ended_at) AS conversation_ended_at,
        max(trace_started_at) AS latest_started_at,
        anyLast(latest_document_uuid) AS latest_document_uuid,
        anyLast(latest_source) AS latest_source,
        anyLast(latest_commit_uuid) AS latest_commit_uuid,
        anyLast(latest_experiment_uuid) AS latest_experiment_uuid
      FROM (
        SELECT
          document_log_uuid,
          trace_id,
          sum(
            coalesce(tokens_prompt, 0) +
            coalesce(tokens_cached, 0) +
            coalesce(tokens_reasoning, 0) +
            coalesce(tokens_completion, 0)
          ) AS trace_tokens,
          dateDiff('millisecond', min(started_at), max(ended_at)) AS trace_duration,
          sum(cost) AS trace_cost,
          min(started_at) AS trace_started_at,
          max(ended_at) AS trace_ended_at,
          anyLast(document_uuid) AS latest_document_uuid,
          anyLast(source) AS latest_source,
          anyLast(commit_uuid) AS latest_commit_uuid,
          anyLast(experiment_uuid) AS latest_experiment_uuid
        FROM ${TABLE_NAME}
        WHERE ${whereClause}
        GROUP BY document_log_uuid, trace_id
      ) AS traces
      GROUP BY document_log_uuid
      LIMIT 1
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await result.json<{
    document_log_uuid: string
    latest_document_uuid: string | null
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
    documentUuid: row.latest_document_uuid,
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
})
