import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

interface CountByEvaluationParams {
  workspaceId: number
  projectId: number
  evaluationUuid: string
  commitUuids?: string[]
  experimentIds?: number[]
  errored?: boolean
  createdAtFrom?: Date
  createdAtTo?: Date
}

export const countEvaluationResultsByEvaluation = scopedQuery(
  async function countEvaluationResultsByEvaluation(
    params: CountByEvaluationParams,
  ): Promise<number> {
    const {
      workspaceId,
      projectId,
      evaluationUuid,
      commitUuids,
      experimentIds,
      errored,
      createdAtFrom,
      createdAtTo,
    } = params

    const conditions: string[] = [
      'workspace_id = {workspaceId: UInt64}',
      'project_id = {projectId: UInt64}',
      'evaluation_uuid = {evaluationUuid: UUID}',
    ]

    const queryParams: Record<string, unknown> = {
      workspaceId,
      projectId,
      evaluationUuid,
    }

    if (commitUuids && commitUuids.length > 0) {
      conditions.push('commit_uuid IN ({commitUuids: Array(UUID)})')
      queryParams.commitUuids = commitUuids
    }

    if (experimentIds && experimentIds.length > 0) {
      conditions.push(
        'experiment_id IN ({experimentIds: Array(Nullable(UInt64))})',
      )
      queryParams.experimentIds = experimentIds
    } else if (experimentIds !== undefined) {
      conditions.push('experiment_id IS NULL')
    }

    if (errored !== undefined) {
      if (errored) {
        conditions.push('has_error = 1')
      } else {
        conditions.push('has_error = 0')
      }
    }

    if (createdAtFrom) {
      conditions.push('created_at >= {createdAtFrom: DateTime64(3)}')
      queryParams.createdAtFrom = toClickHouseDateTime(createdAtFrom)
    }

    if (createdAtTo) {
      conditions.push('created_at <= {createdAtTo: DateTime64(3)}')
      queryParams.createdAtTo = toClickHouseDateTime(createdAtTo)
    }

    const query = `
      SELECT count() as count
      FROM ${TABLE_NAME}
      WHERE ${conditions.join(' AND ')}
    `

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    const rows = await result.json<{ count: number }>()
    return rows[0]?.count ?? 0
  },
)
