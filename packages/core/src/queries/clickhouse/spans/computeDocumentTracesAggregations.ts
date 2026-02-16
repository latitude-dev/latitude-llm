import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { TracesAggregations } from '../../../schema/models/types/Span'

export async function computeDocumentTracesAggregations({
  workspaceId,
  documentUuid,
  commitUuid,
}: {
  workspaceId: number
  documentUuid: string
  commitUuid?: string
}): Promise<TracesAggregations> {
  const params: Record<string, unknown> = {
    workspaceId,
    documentUuid,
  }

  const countConditions = [
    `workspace_id = {workspaceId: UInt64}`,
    `document_uuid = {documentUuid: String}`,
  ]

  const aggregationConditions = [
    `workspace_id = {workspaceId: UInt64}`,
    `document_uuid = {documentUuid: String}`,
    `type = 'completion'`,
  ]

  if (commitUuid) {
    params.commitUuid = commitUuid
    countConditions.push(`commit_uuid = {commitUuid: String}`)
    aggregationConditions.push(`commit_uuid = {commitUuid: String}`)
  }

  // Query for total count of distinct traces
  const countResult = await clickhouseClient().query({
    query: `
      SELECT count(DISTINCT trace_id) AS total_count
      FROM ${SPANS_TABLE}
      WHERE ${countConditions.join(' AND ')}
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const countRows = await countResult.json<{ total_count: string }>()
  const totalCount = Number(countRows[0]?.total_count ?? 0)

  // Query for aggregations with median calculations using quantile(0.5)
  const aggregationResult = await clickhouseClient().query({
    query: `
      SELECT
        coalesce(
          sum(
            coalesce(tokens_prompt, 0) +
            coalesce(tokens_cached, 0) +
            coalesce(tokens_reasoning, 0) +
            coalesce(tokens_completion, 0)
          ),
          0
        ) AS total_tokens,
        coalesce(sum(cost), 0) AS total_cost_in_millicents,
        coalesce(
          avg(
            coalesce(tokens_prompt, 0) +
            coalesce(tokens_cached, 0) +
            coalesce(tokens_reasoning, 0) +
            coalesce(tokens_completion, 0)
          ),
          0
        ) AS average_tokens,
        coalesce(avg(cost), 0) AS average_cost_in_millicents,
        coalesce(quantile(0.5)(cost), 0) AS median_cost_in_millicents,
        coalesce(avg(duration_ms), 0) AS average_duration,
        coalesce(quantile(0.5)(duration_ms), 0) AS median_duration
      FROM ${SPANS_TABLE}
      WHERE ${aggregationConditions.join(' AND ')}
    `,
    format: 'JSONEachRow',
    query_params: params,
  })

  const aggRows = await aggregationResult.json<{
    total_tokens: string
    total_cost_in_millicents: string
    average_tokens: string
    average_cost_in_millicents: string
    median_cost_in_millicents: string
    average_duration: string
    median_duration: string
  }>()

  const row = aggRows[0] ?? {
    total_tokens: '0',
    total_cost_in_millicents: '0',
    average_tokens: '0',
    average_cost_in_millicents: '0',
    median_cost_in_millicents: '0',
    average_duration: '0',
    median_duration: '0',
  }

  return {
    totalCount,
    totalTokens: Number(row.total_tokens),
    totalCostInMillicents: Number(row.total_cost_in_millicents),
    averageTokens: Number(row.average_tokens),
    averageCostInMillicents: Number(row.average_cost_in_millicents),
    medianCostInMillicents: Number(row.median_cost_in_millicents),
    averageDuration: Number(row.average_duration),
    medianDuration: Number(row.median_duration),
  }
}
