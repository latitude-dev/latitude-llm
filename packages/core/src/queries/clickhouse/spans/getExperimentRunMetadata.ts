import { SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/spans'
import { scopedQuery } from '../../scope'

export type ExperimentRunMetadataResult = {
  count: number
  totalDuration: number
  totalCost: number
  totalTokens: number
}

export const getExperimentRunMetadata = scopedQuery(
  async function getExperimentRunMetadata(
    {
      workspaceId,
      experimentUuid,
    }: {
      workspaceId: number
      experimentUuid: string
    },
  ): Promise<ExperimentRunMetadataResult> {
    const result = await clickhouseClient().query({
      query: `
      WITH experiment_trace_ids AS (
        SELECT DISTINCT trace_id
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND experiment_uuid = {experimentUuid: UUID}
      )
      SELECT
        countDistinctIf(trace_id, type IN ({runTypes: Array(String)})) AS trace_count,
        coalesce(sumIf(duration_ms, type IN ({runTypes: Array(String)})), 0) AS total_duration,
        coalesce(sumIf(cost, type = {completionType: String}), 0) AS total_cost,
        coalesce(
          sumIf(
            coalesce(tokens_prompt, 0) +
              coalesce(tokens_cached, 0) +
              coalesce(tokens_reasoning, 0) +
              coalesce(tokens_completion, 0),
            type = {completionType: String}
          ),
          0
        ) AS total_tokens
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND trace_id IN (SELECT trace_id FROM experiment_trace_ids)
    `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        experimentUuid,
        runTypes: [SpanType.Prompt, SpanType.Chat],
        completionType: SpanType.Completion,
      },
    })

    const rows = await result.json<{
      trace_count: string
      total_duration: string
      total_cost: string
      total_tokens: string
    }>()

    const row = rows[0]
    return {
      count: Number(row?.trace_count ?? 0),
      totalDuration: Number(row?.total_duration ?? 0),
      totalCost: Number(row?.total_cost ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
    }
  },
)
