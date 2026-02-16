import { SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'

export async function getExperimentPromptSpansBefore({
  workspaceId,
  documentUuid,
  before,
  limit,
}: {
  workspaceId: number
  documentUuid: string
  before: Date
  limit: number
}) {
  const result = await clickhouseClient().query({
    query: `
      SELECT span_id, trace_id
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND document_uuid = {documentUuid: UUID}
        AND started_at < {before: DateTime64(6, 'UTC')}
        AND experiment_uuid IS NULL
        AND type = {promptType: String}
      ORDER BY started_at DESC
      LIMIT {limit: UInt32}
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      documentUuid,
      before: toClickHouseDateTime(before),
      promptType: SpanType.Prompt,
      limit,
    },
  })

  return result.json<{ span_id: string; trace_id: string }>()
}
