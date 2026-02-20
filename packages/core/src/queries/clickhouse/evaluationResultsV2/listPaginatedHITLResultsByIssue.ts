import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { EvaluationType } from '../../../constants'
import { scopedQuery } from '../../scope'

interface ListPaginatedHITLResultsByIssueParams {
  workspaceId: number
  issueId: number
  commitUuids: string[]
  afterDate?: string
  orderDirection: 'asc' | 'desc'
  fetchLimit: number
  offset: number
}

export type HITLResultRow = {
  id: number
  evaluated_span_id: string | null
  evaluated_trace_id: string | null
  created_at: string
  commit_uuid: string
}

export const listPaginatedHITLResultsByIssue = scopedQuery(
  async function listPaginatedHITLResultsByIssue({
    workspaceId,
    issueId,
    commitUuids,
    afterDate,
    orderDirection,
    fetchLimit,
    offset,
  }: ListPaginatedHITLResultsByIssueParams): Promise<HITLResultRow[]> {
    const conditions = [
      'workspace_id = {workspaceId: UInt64}',
      'type = {evaluationType: String}',
      'evaluated_span_id IS NOT NULL',
      'evaluated_trace_id IS NOT NULL',
      'has(issue_ids, {issueId: UInt64})',
    ]

    const queryParams: Record<string, unknown> = {
      workspaceId,
      evaluationType: EvaluationType.Human,
      issueId,
    }

    if (commitUuids.length > 0) {
      conditions.push('commit_uuid IN ({commitUuids: Array(UUID)})')
      queryParams.commitUuids = commitUuids
    }

    if (afterDate) {
      conditions.push('created_at > {afterDate: DateTime64(3)}')
      queryParams.afterDate = new Date(afterDate).toISOString()
    }

    const orderDirectionSql = orderDirection === 'asc' ? 'ASC' : 'DESC'

    const result = await clickhouseClient().query({
      query: `
        SELECT id, evaluated_span_id, evaluated_trace_id, created_at, commit_uuid
        FROM ${TABLE_NAME}
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at ${orderDirectionSql}, id ${orderDirectionSql}
        LIMIT {fetchLimit: UInt64} OFFSET {offset: UInt64}
      `,
      format: 'JSONEachRow',
      query_params: { ...queryParams, fetchLimit, offset },
    })

    return result.json<HITLResultRow>()
  },
)
