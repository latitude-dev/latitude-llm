import { SpanType } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { scopedQuery } from '../../scope'

export const getGlobalLogsStats = scopedQuery(async function getGlobalLogsStats(
  {
    workspaceId,
    from,
    to,
  }: {
    workspaceId: number
    from: Date
    to: Date
  },
  _db,
) {
  const result = await clickhouseClient().query({
    query: `
      SELECT
        countDistinct(trace_id) AS logs_count,
        coalesce(
          sumIf(
            coalesce(tokens_prompt, 0) +
              coalesce(tokens_completion, 0) +
              coalesce(tokens_cached, 0) +
              coalesce(tokens_reasoning, 0),
            type = {completionType: String}
          ),
          0
        ) AS total_tokens,
        coalesce(sumIf(cost, type = {completionType: String}), 0) AS total_cost
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND started_at >= {from: DateTime64(6, 'UTC')}
        AND started_at <= {to: DateTime64(6, 'UTC')}
    `,
    format: 'JSONEachRow',
    query_params: {
      workspaceId,
      from: toClickHouseDateTime(from),
      to: toClickHouseDateTime(to),
      completionType: SpanType.Completion,
    },
  })

  const rows = await result.json<{
    logs_count: string
    total_tokens: string
    total_cost: string
  }>()

  return {
    logsCount: Number(rows[0]?.logs_count ?? 0),
    tokensSpent: Number(rows[0]?.total_tokens ?? 0),
    totalCostInMillicents: Number(rows[0]?.total_cost ?? 0),
  }
})

export const getTopProjectsLogsStats = scopedQuery(
  async function getTopProjectsLogsStats(
    {
      workspaceId,
      from,
      to,
      projectsLimit,
    }: {
      workspaceId: number
      from: Date
      to: Date
      projectsLimit: number
    },
    _db,
  ) {
    const result = await clickhouseClient().query({
      query: `
      SELECT
        project_id,
        countDistinct(trace_id) AS logs_count,
        coalesce(
          sumIf(
            coalesce(tokens_prompt, 0) +
              coalesce(tokens_completion, 0) +
              coalesce(tokens_cached, 0) +
              coalesce(tokens_reasoning, 0),
            type = {completionType: String}
          ),
          0
        ) AS total_tokens,
        coalesce(sumIf(cost, type = {completionType: String}), 0) AS total_cost
      FROM ${SPANS_TABLE}
      WHERE workspace_id = {workspaceId: UInt64}
        AND project_id IS NOT NULL
        AND started_at >= {from: DateTime64(6, 'UTC')}
        AND started_at <= {to: DateTime64(6, 'UTC')}
      GROUP BY project_id
      ORDER BY logs_count DESC
      LIMIT {projectsLimit: UInt32}
    `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        from: toClickHouseDateTime(from),
        to: toClickHouseDateTime(to),
        projectsLimit,
        completionType: SpanType.Completion,
      },
    })

    const rows = await result.json<{
      project_id: number
      logs_count: string
      total_tokens: string
      total_cost: string
    }>()

    return rows.map((row) => ({
      projectId: Number(row.project_id),
      logsCount: Number(row.logs_count),
      tokensSpent: Number(row.total_tokens),
      totalCostInMillicents: Number(row.total_cost),
    }))
  },
)
