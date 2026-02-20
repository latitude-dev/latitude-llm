import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { EvaluationResultV2 } from '../../../constants'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

interface ListByIssueIdsParams {
  workspaceId: number
  commitUuids: string[]
  issueIds: number[]
}

export const listEvaluationResultsByIssueIds = scopedQuery(
  async function listEvaluationResultsByIssueIds({
    workspaceId,
    commitUuids,
    issueIds,
  }: ListByIssueIdsParams) {
    if (!commitUuids.length || !issueIds.length) return []

    const result = await clickhouseClient().query({
      query: `
        SELECT *
        FROM ${TABLE_NAME}
        WHERE workspace_id = {workspaceId: UInt64}
          AND commit_uuid IN ({commitUuids: Array(UUID)})
          AND hasAny(issue_ids, {issueIds: Array(UInt64)})
        ORDER BY created_at DESC, id DESC
      `,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        commitUuids,
        issueIds,
      },
    })

    const rows = await result.json<EvaluationResultV2Row>()
    return rows.map((row) => ({
      ...(mapRow(row) as EvaluationResultV2),
      issueIds: row.issue_ids.map(Number),
    }))
  },
)
