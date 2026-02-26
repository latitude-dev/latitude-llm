import { clickhouseClient } from '../../../client/clickhouse'
import { TracesAggregations } from '../../../schema/models/types/Span'
import { scopedQuery } from '../../scope'

const TRACE_AGGREGATIONS_TABLE = 'spans_trace_aggregations'

export const computeDocumentTracesAggregations = scopedQuery(
  async function computeDocumentTracesAggregations({
    workspaceId,
    projectId,
    documentUuid,
    commitUuid,
  }: {
    workspaceId: number
    projectId: number
    documentUuid: string
    commitUuid?: string
  }): Promise<TracesAggregations> {
    const params: Record<string, unknown> = {
      workspaceId,
      projectId,
      documentUuid,
    }

    const conditions = [
      `(trace_project_id_key = {projectId: UInt64} OR trace_project_id_key = 0)`,
      `trace_document_uuid_key = {documentUuid: UUID}`,
    ]

    if (commitUuid) {
      conditions.push(`trace_commit_uuid_key = {commitUuid: UUID}`)
      params.commitUuid = commitUuid
    }

    // Query all metrics in a single pass
    const aggregationResult = await clickhouseClient().query({
      query: `
      SELECT
        countDistinct(trace_id) AS total_count,
        coalesce(sum(total_tokens), 0) AS total_tokens_sum,
        coalesce(sum(total_cost_in_millicents), 0) AS total_cost_sum,
        if(
          sum(completion_count) = 0,
          0,
          sum(total_tokens) / toFloat64(sum(completion_count))
        ) AS average_tokens,
        if(
          sum(completion_count) = 0,
          0,
          sum(total_cost_in_millicents) /
            toFloat64(sum(completion_count))
        ) AS average_cost_in_millicents,
        if(
          isNaN(quantileMerge(0.5)(median_cost_state)),
          0,
          quantileMerge(0.5)(median_cost_state)
        ) AS median_cost_in_millicents,
        if(
          sum(completion_count) = 0,
          0,
          sum(total_duration) / toFloat64(sum(completion_count))
        ) AS average_duration,
        if(
          isNaN(quantileMerge(0.5)(median_duration_state)),
          0,
          quantileMerge(0.5)(median_duration_state)
        ) AS median_duration
      FROM ${TRACE_AGGREGATIONS_TABLE} FINAL
      WHERE workspace_id = {workspaceId: UInt64}
        AND ${conditions.join(' AND ')}
    `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const aggRows = await aggregationResult.json<{
      total_count: string
      total_tokens_sum: string
      total_cost_sum: string
      average_tokens: string
      average_cost_in_millicents: string
      median_cost_in_millicents: string
      average_duration: string
      median_duration: string
    }>()

    const row = aggRows[0] ?? {
      total_count: '0',
      total_tokens_sum: '0',
      total_cost_sum: '0',
      average_tokens: '0',
      average_cost_in_millicents: '0',
      median_cost_in_millicents: '0',
      average_duration: '0',
      median_duration: '0',
    }

    return {
      totalCount: Number(row.total_count),
      totalTokens: Number(row.total_tokens_sum),
      totalCostInMillicents: Number(row.total_cost_sum),
      averageTokens: Number(row.average_tokens),
      averageCostInMillicents: Number(row.average_cost_in_millicents),
      medianCostInMillicents: Number(row.median_cost_in_millicents),
      averageDuration: Number(row.average_duration),
      medianDuration: Number(row.median_duration),
    }
  },
)
