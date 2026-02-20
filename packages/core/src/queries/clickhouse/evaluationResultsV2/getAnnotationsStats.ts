import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

interface GetAnnotationsStatsParams {
  workspaceId: number
  dateFrom: string
  dateTo: string
}

export const getAnnotationsStats = scopedQuery(
  async function getAnnotationsStats(params: GetAnnotationsStatsParams, _db) {
    const { workspaceId, dateFrom, dateTo } = params

    const query = `
      SELECT
        count() as total_count,
        countIf(has_passed = 1) as passed_count,
        countIf(has_passed = 0) as failed_count
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND type = 'human'
        AND has_passed IS NOT NULL
        AND created_at >= {dateFrom: DateTime64(3)}
        AND created_at <= {dateTo: DateTime64(3)}
    `

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: { workspaceId, dateFrom, dateTo },
    })

    const rows = await result.json<{
      total_count: number
      passed_count: number
      failed_count: number
    }>()

    return rows[0] ?? { total_count: 0, passed_count: 0, failed_count: 0 }
  },
)

export const getAllTimesAnnotationsCount = scopedQuery(
  async function getAllTimesAnnotationsCount(
    { workspaceId }: { workspaceId: number },
  ) {
    const query = `
      SELECT count() as cnt
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND type = 'human'
    `

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: { workspaceId },
    })

    const rows = await result.json<{ cnt: number }>()
    return rows[0]?.cnt ?? 0
  },
)

interface TopProjectParams {
  workspaceId: number
  dateFrom: string
  dateTo: string
  limit: number
}

export const getTopProjectsAnnotations = scopedQuery(
  async function getTopProjectsAnnotations(params: TopProjectParams, _db) {
    const { workspaceId, dateFrom, dateTo, limit } = params

    const query = `
      SELECT
        project_id,
        count() as total_count,
        countIf(has_passed = 1) as passed_count,
        countIf(has_passed = 0) as failed_count
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND type = 'human'
        AND has_passed IS NOT NULL
        AND created_at >= {dateFrom: DateTime64(3)}
        AND created_at <= {dateTo: DateTime64(3)}
        AND project_id IS NOT NULL
      GROUP BY project_id
      ORDER BY total_count DESC
      LIMIT {limit: UInt64}
    `

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: { workspaceId, dateFrom, dateTo, limit },
    })

    return result.json<{
      project_id: number
      total_count: number
      passed_count: number
      failed_count: number
    }>()
  },
)
