import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

interface GetStatsByEvaluationParams {
  workspaceId: number
  evaluationUuid: string
  isLlmEvaluation: boolean
  commitUuids?: string[]
  experimentIds?: number[]
  errored?: boolean
  createdAtFrom?: Date
  createdAtTo?: Date
}

export type EvaluationTotalStatsRow = {
  total_results: number
  average_score: number | null
  total_tokens: number | null
  total_cost: number | null
}

export type EvaluationDailyStatsRow = {
  date: string
  total_results: number
  average_score: number
  total_tokens: number | null
  total_cost: number | null
}

export type EvaluationVersionStatsRow = {
  commit_uuid: string
  total_results: number
  average_score: number | null
  total_tokens: number | null
  total_cost: number | null
}

export const getEvaluationStatsByEvaluation = scopedQuery(
  async function getEvaluationStatsByEvaluation(
    params: GetStatsByEvaluationParams,
  ): Promise<{
    totalStats: EvaluationTotalStatsRow | undefined
    dailyStats: EvaluationDailyStatsRow[]
    versionStats: EvaluationVersionStatsRow[]
  }> {
    const {
      workspaceId,
      evaluationUuid,
      isLlmEvaluation,
      commitUuids,
      experimentIds,
      errored,
      createdAtFrom,
      createdAtTo,
    } = params

    const conditions: string[] = [
      'workspace_id = {workspaceId: UInt64}',
      'evaluation_uuid = {evaluationUuid: UUID}',
      'has_error = 0',
    ]

    const queryParams: Record<string, unknown> = {
      workspaceId,
      evaluationUuid,
    }

    if (commitUuids !== undefined) {
      if (commitUuids.length > 0) {
        conditions.push('commit_uuid IN ({commitUuids: Array(UUID)})')
        queryParams.commitUuids = commitUuids
      } else {
        return { totalStats: undefined, dailyStats: [], versionStats: [] }
      }
    }

    if (experimentIds !== undefined) {
      if (experimentIds.length > 0) {
        conditions.push(
          'experiment_id IN ({experimentIds: Array(Nullable(UInt64))})',
        )
        queryParams.experimentIds = experimentIds
      } else {
        conditions.push('experiment_id IS NULL')
      }
    }

    if (errored !== undefined) {
      conditions.push(errored ? 'has_error = 1' : 'has_error = 0')
    }

    if (createdAtFrom) {
      conditions.push('created_at >= {createdAtFrom: DateTime64(3)}')
      queryParams.createdAtFrom = toClickHouseDateTime(createdAtFrom)
    }

    if (createdAtTo) {
      conditions.push('created_at <= {createdAtTo: DateTime64(3)}')
      queryParams.createdAtTo = toClickHouseDateTime(createdAtTo)
    }

    const tokensSql = isLlmEvaluation ? 'sum(tokens)' : '0'
    const costSql = isLlmEvaluation ? 'sum(cost)' : '0'
    const where = conditions.join(' AND ')

    const [totalResult, dailyResult, versionResult] = await Promise.all([
      clickhouseClient().query({
        query: `
          SELECT
            count() as total_results,
            avg(score) as average_score,
            ${tokensSql} as total_tokens,
            ${costSql} as total_cost
          FROM ${TABLE_NAME}
          WHERE ${where}
        `,
        format: 'JSONEachRow',
        query_params: queryParams,
      }),
      clickhouseClient().query({
        query: `
          SELECT
            toStartOfDay(created_at) as date,
            count() as total_results,
            avg(score) as average_score,
            ${tokensSql} as total_tokens,
            ${costSql} as total_cost
          FROM ${TABLE_NAME}
          WHERE ${where}
          GROUP BY date
          ORDER BY date ASC
        `,
        format: 'JSONEachRow',
        query_params: queryParams,
      }),
      clickhouseClient().query({
        query: `
          SELECT
            commit_uuid,
            count() as total_results,
            avg(score) as average_score,
            ${tokensSql} as total_tokens,
            ${costSql} as total_cost
          FROM ${TABLE_NAME}
          WHERE ${where}
          GROUP BY commit_uuid
          ORDER BY total_results ASC
        `,
        format: 'JSONEachRow',
        query_params: queryParams,
      }),
    ])

    const [totalRows, dailyRows, versionRows] = await Promise.all([
      totalResult.json<EvaluationTotalStatsRow>(),
      dailyResult.json<EvaluationDailyStatsRow>(),
      versionResult.json<EvaluationVersionStatsRow>(),
    ])

    return {
      totalStats: totalRows[0],
      dailyStats: dailyRows,
      versionStats: versionRows,
    }
  },
)
