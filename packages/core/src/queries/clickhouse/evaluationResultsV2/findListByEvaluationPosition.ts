import { toClickHouseDateTime } from '../../../clickhouse/insert'
import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

interface FindListByEvaluationPositionParams {
  workspaceId: number
  projectId: number
  evaluationUuid: string
  resultId: number
  orderBy: 'asc' | 'desc'
  pageSize: number
  commitUuids?: string[]
  experimentIds?: number[]
  errored?: boolean
  createdAtFrom?: Date
  createdAtTo?: Date
}

export const findEvaluationResultListPosition = scopedQuery(
  async function findEvaluationResultListPosition(
    params: FindListByEvaluationPositionParams,
  ): Promise<number | undefined> {
    const {
      workspaceId,
      projectId,
      evaluationUuid,
      resultId,
      orderBy,
      pageSize,
      commitUuids,
      experimentIds,
      errored,
      createdAtFrom,
      createdAtTo,
    } = params

    const targetResult = await clickhouseClient().query({
      query: `
        SELECT id, created_at
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND project_id = {projectId: UInt64}
          AND id = {resultId: UInt64}
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      format: 'JSONEachRow',
      query_params: { workspaceId, projectId, resultId },
    })

    const targetRows = await targetResult.json<{
      id: number
      created_at: string
    }>()
    const target = targetRows[0]
    if (!target) return undefined

    const conditions: string[] = [
      'workspace_id = {workspaceId: UInt64}',
      'project_id = {projectId: UInt64}',
      'evaluation_uuid = {evaluationUuid: UUID}',
    ]

    const queryParams: Record<string, unknown> = {
      workspaceId,
      projectId,
      evaluationUuid,
      cursorCreatedAt: target.created_at,
      cursorId: target.id,
    }

    if (commitUuids !== undefined) {
      if (commitUuids.length > 0) {
        conditions.push('commit_uuid IN ({commitUuids: Array(UUID)})')
        queryParams.commitUuids = commitUuids
      } else {
        return undefined
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

    conditions.push(
      orderBy === 'asc'
        ? '(created_at, id) <= ({cursorCreatedAt: DateTime64(3)}, {cursorId: UInt64})'
        : '(created_at, id) >= ({cursorCreatedAt: DateTime64(3)}, {cursorId: UInt64})',
    )

    const countResult = await clickhouseClient().query({
      query: `
        SELECT count() as count
        FROM ${TABLE_NAME}
        WHERE ${conditions.join(' AND ')}
      `,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    const countRows = await countResult.json<{ count: number }>()
    const position = countRows[0]?.count
    if (!position) return undefined

    return Math.ceil(position / pageSize)
  },
)
