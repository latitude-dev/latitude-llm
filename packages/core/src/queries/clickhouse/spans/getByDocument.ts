import {
  LogSources,
  MainSpanType,
  Span,
  SpanStatus,
} from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE, SpanRow } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { spanRowToSpan } from './toSpan'

export async function getSpansByDocument({
  workspaceId,
  documentUuid,
  spanTypes,
  commitUuids,
  optimizationExperimentUuids,
  cursor,
  limit,
}: {
  workspaceId: number
  documentUuid: string
  spanTypes: MainSpanType[]
  commitUuids: string[]
  optimizationExperimentUuids: string[]
  cursor: { value: Date; id: string } | null
  limit: number
}) {
  if (commitUuids.length === 0) {
    return { spans: [] as Span<MainSpanType>[], next: null }
  }

  const params: Record<string, unknown> = {
    workspaceId,
    documentUuid,
    spanTypes,
    commitUuids,
    okStatus: SpanStatus.Ok,
    optimizationSource: LogSources.Optimization,
    experimentSource: LogSources.Experiment,
    fetchLimit: limit + 1,
  }

  const conditions = [
    `workspace_id = {workspaceId: UInt64}`,
    `document_uuid = {documentUuid: String}`,
    `type IN ({spanTypes: Array(String)})`,
    `status = {okStatus: String}`,
    `commit_uuid IN ({commitUuids: Array(String)})`,
    `source != {optimizationSource: String}`,
  ]

  const experimentConditions = [
    `source != {experimentSource: String}`,
    `experiment_uuid IS NULL`,
  ]

  if (optimizationExperimentUuids.length > 0) {
    params.optimizationExperimentUuids = optimizationExperimentUuids
    experimentConditions.push(
      `experiment_uuid NOT IN ({optimizationExperimentUuids: Array(String)})`,
    )
  }

  conditions.push(`(${experimentConditions.join(' OR ')})`)

  if (cursor) {
    params.cursorStartedAt = toClickHouseDateTime(cursor.value)
    params.cursorId = cursor.id
    conditions.push(
      `(started_at, span_id) < ({cursorStartedAt: DateTime64(6, 'UTC')}, {cursorId: String})`,
    )
  }

  const result = await clickhouseClient().query({
    query: `
      SELECT *
      FROM ${SPANS_TABLE}
      WHERE ${conditions.join(' AND ')}
      ORDER BY started_at DESC, span_id DESC
      LIMIT {fetchLimit: UInt32}
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await result.json<SpanRow>()
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const spans = items.map((row) => spanRowToSpan(row) as Span<MainSpanType>)

  const next =
    hasMore && spans.length > 0
      ? {
          value: spans[spans.length - 1]!.startedAt,
          id: spans[spans.length - 1]!.id,
        }
      : null

  return { spans, next }
}
