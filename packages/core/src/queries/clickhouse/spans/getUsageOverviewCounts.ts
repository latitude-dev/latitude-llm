import { SpanStatus } from '@latitude-data/constants'
import { clickhouseClient } from '../../../client/clickhouse'
import { SPANS_TABLE } from '../../../clickhouse/models/spans'
import { toClickHouseDateTime } from '../../../clickhouse/insert'

type UsageOverviewSpansCountRow = {
  workspace_id: number
  latest_created_at: string | null
  last_month_count: string
  last_two_months_count: string
}

export type UsageOverviewSpansCount = {
  workspaceId: number
  latestCreatedAt: string | null
  lastMonthCount: number
  lastTwoMonthsCount: number
}

export async function getUsageOverviewCounts({
  lastMonthBoundary,
  lastTwoMonthsBoundary,
  workspaceIds,
}: {
  lastMonthBoundary: Date
  lastTwoMonthsBoundary: Date
  workspaceIds?: number[]
}) {
  if (workspaceIds && workspaceIds.length === 0) return []

  const hasWorkspaceFilter = Boolean(workspaceIds)
  const workspaceFilter = hasWorkspaceFilter
    ? 'AND workspace_id IN ({workspaceIds: Array(UInt64)})'
    : ''

  const queryParams: Record<string, unknown> = {
    errorStatus: SpanStatus.Error,
    lastMonthBoundary: toClickHouseDateTime(lastMonthBoundary),
    lastTwoMonthsBoundary: toClickHouseDateTime(lastTwoMonthsBoundary),
  }

  if (workspaceIds) {
    queryParams.workspaceIds = workspaceIds
  }

  const result = await clickhouseClient().query({
    query: `
      SELECT
        workspace_id,
        max(started_at) AS latest_created_at,
        countIf(started_at >= {lastMonthBoundary: DateTime64(6, 'UTC')}) AS last_month_count,
        countIf(
          started_at >= {lastTwoMonthsBoundary: DateTime64(6, 'UTC')}
            AND started_at < {lastMonthBoundary: DateTime64(6, 'UTC')}
        ) AS last_two_months_count
      FROM ${SPANS_TABLE}
      WHERE status != {errorStatus: String}
      ${workspaceFilter}
      GROUP BY workspace_id
    `,
    format: 'JSONEachRow',
    query_params: queryParams,
  })

  const rows = await result.json<UsageOverviewSpansCountRow>()

  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    latestCreatedAt: row.latest_created_at,
    lastMonthCount: Number(row.last_month_count),
    lastTwoMonthsCount: Number(row.last_two_months_count),
  })) satisfies UsageOverviewSpansCount[]
}
