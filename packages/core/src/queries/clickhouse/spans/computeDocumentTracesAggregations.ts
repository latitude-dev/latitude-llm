import { SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { TracesAggregations } from '../../../schema/models/types/Span'
import { scopedQuery } from '../../scope'

export const computeDocumentTracesAggregations = scopedQuery(
  async function computeDocumentTracesAggregations(
    {
      workspaceId,
      documentUuid,
      commitUuid,
    }: {
      workspaceId: number
      documentUuid: string
      commitUuid?: string
    },
    _db,
  ): Promise<TracesAggregations> {
    const params: Record<string, unknown> = {
      workspaceId,
      documentUuid,
      completionType: SpanType.Completion,
    }

    const conditions = [
      `workspace_id = {workspaceId: UInt64}`,
      `document_uuid = {documentUuid: UUID}`,
    ]

    if (commitUuid) {
      params.commitUuid = commitUuid
      conditions.push(`commit_uuid = {commitUuid: UUID}`)
    }

    // Query all metrics in a single pass
    const aggregationResult = await clickhouseClient().query({
      query: `
      SELECT
        countDistinct(trace_id) AS total_count,
        coalesce(
          sumIf(
            coalesce(tokens_prompt, 0) +
            coalesce(tokens_cached, 0) +
            coalesce(tokens_reasoning, 0) +
            coalesce(tokens_completion, 0),
            type = {completionType: String}
          ),
          0
        ) AS total_tokens,
        coalesce(
          sumIf(cost, type = {completionType: String}),
          0
        ) AS total_cost_in_millicents,
        if(
          isNaN(
            avgIf(
              coalesce(tokens_prompt, 0) +
              coalesce(tokens_cached, 0) +
              coalesce(tokens_reasoning, 0) +
              coalesce(tokens_completion, 0),
              type = {completionType: String}
            )
          ),
          0,
          avgIf(
            coalesce(tokens_prompt, 0) +
            coalesce(tokens_cached, 0) +
            coalesce(tokens_reasoning, 0) +
            coalesce(tokens_completion, 0),
            type = {completionType: String}
          )
        ) AS average_tokens,
        if(
          isNaN(avgIf(cost, type = {completionType: String})),
          0,
          avgIf(cost, type = {completionType: String})
        ) AS average_cost_in_millicents,
        if(
          isNaN(quantileIf(0.5)(cost, type = {completionType: String})),
          0,
          quantileIf(0.5)(cost, type = {completionType: String})
        ) AS median_cost_in_millicents,
        if(
          isNaN(avgIf(duration_ms, type = {completionType: String})),
          0,
          avgIf(duration_ms, type = {completionType: String})
        ) AS average_duration,
        if(
          isNaN(quantileIf(0.5)(duration_ms, type = {completionType: String})),
          0,
          quantileIf(0.5)(duration_ms, type = {completionType: String})
        ) AS median_duration
      FROM ${SPANS_TABLE}
      WHERE ${conditions.join(' AND ')}
    `,
      format: 'JSONEachRow',
      query_params: params,
    })

    const aggRows = await aggregationResult.json<{
      total_count: string
      total_tokens: string
      total_cost_in_millicents: string
      average_tokens: string
      average_cost_in_millicents: string
      median_cost_in_millicents: string
      average_duration: string
      median_duration: string
    }>()

    const row = aggRows[0] ?? {
      total_count: '0',
      total_tokens: '0',
      total_cost_in_millicents: '0',
      average_tokens: '0',
      average_cost_in_millicents: '0',
      median_cost_in_millicents: '0',
      average_duration: '0',
      median_duration: '0',
    }

    return {
      totalCount: Number(row.total_count),
      totalTokens: Number(row.total_tokens),
      totalCostInMillicents: Number(row.total_cost_in_millicents),
      averageTokens: Number(row.average_tokens),
      averageCostInMillicents: Number(row.average_cost_in_millicents),
      medianCostInMillicents: Number(row.median_cost_in_millicents),
      averageDuration: Number(row.average_duration),
      medianDuration: Number(row.median_duration),
    }
  },
)
