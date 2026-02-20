import { SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { scopedQuery } from '../../scope'

export const getExperimentPromptSpansBefore = scopedQuery(
  async function getExperimentPromptSpansBefore(
    {
      workspaceId,
      projectId,
      documentUuid,
      before,
      limit,
    }: {
      workspaceId: number
      projectId: number
      documentUuid: string
      before: Date
      limit: number
    },
  ) {
    const result = await clickhouseClient().query({
      query: `
      SELECT span_id, trace_id
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        -- TODO(clickhouse): remove non-_key predicate after key-column rollout.
        AND project_id = {projectId: UInt64}
        AND project_id_key = {projectId: UInt64}
        -- TODO(clickhouse): remove non-_key predicate after key-column rollout.
        AND document_uuid = {documentUuid: UUID}
        AND document_uuid_key = {documentUuid: UUID}
        AND started_at < {before: DateTime64(6, 'UTC')}
        AND experiment_uuid IS NULL
        AND type = {promptType: String}
      ORDER BY started_at DESC
      LIMIT {limit: UInt32}
    `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        projectId,
        documentUuid,
        before: toClickHouseDateTime(before),
        promptType: SpanType.Prompt,
        limit,
      },
    })

    return result.json<{ span_id: string; trace_id: string }>()
  },
)
