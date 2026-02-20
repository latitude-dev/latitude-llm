import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

interface ListByEvaluationParams {
  workspaceId: number
  projectId: number
  evaluationUuid: string
  commitUuids?: string[]
  experimentIds?: number[]
  errored?: boolean
  createdAtFrom?: Date
  createdAtTo?: Date
  limit: number
  offset: number
  orderBy: 'asc' | 'desc'
}

export const listEvaluationResultsByEvaluation = scopedQuery(
  async function listEvaluationResultsByEvaluation(
    params: ListByEvaluationParams,
  ) {
    const {
      workspaceId,
      projectId,
      evaluationUuid,
      commitUuids,
      experimentIds,
      errored,
      createdAtFrom,
      createdAtTo,
      limit,
      offset,
      orderBy,
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

    const orderDirection = orderBy === 'asc' ? 'ASC' : 'DESC'

    const query = `
      SELECT *
      FROM ${TABLE_NAME}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at ${orderDirection}, id ${orderDirection}
      LIMIT {limit: UInt64} OFFSET {offset: UInt64}
    `

    queryParams.limit = limit
    queryParams.offset = offset

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    return result.json<EvaluationResultV2Row>().then((rows) => rows.map(mapRow))
  },
)
