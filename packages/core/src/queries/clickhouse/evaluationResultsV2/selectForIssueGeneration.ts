import { clickhouseClient } from '../../../client/clickhouse'
import {
  TABLE_NAME,
  EvaluationResultV2Row,
} from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'
import { mapRow } from './mapRow'

interface SelectForIssueGenerationParams {
  workspaceId: number
  issueId: number
  mergedCommitUuids: string[]
  recentDate: string
  newerLimit: number
  olderLimit: number
}

export const selectEvaluationResultsForIssueGeneration = scopedQuery(
  async function selectEvaluationResultsForIssueGeneration({
    workspaceId,
    issueId,
    mergedCommitUuids,
    recentDate,
    newerLimit,
    olderLimit,
  }: SelectForIssueGenerationParams) {
    if (!mergedCommitUuids.length) return []

    const queryParams = {
      workspaceId,
      issueId,
      mergedCommitUuids,
      recentDate,
      newerLimit,
      olderLimit,
    }

    const [newerResult, olderResult] = await Promise.all([
      clickhouseClient().query({
        query: `
          SELECT *
          FROM ${TABLE_NAME}
          WHERE workspace_id = {workspaceId: UInt64}
            AND has_error = 0
            AND experiment_id IS NULL
            AND has_passed != 1
            AND has(issue_ids, {issueId: UInt64})
            AND commit_uuid IN ({mergedCommitUuids: Array(UUID)})
            AND created_at >= {recentDate: DateTime64(3)}
          ORDER BY created_at DESC, id DESC, normalized_score ASC
          LIMIT {newerLimit: UInt64}
        `,
        format: 'JSONEachRow',
        query_params: queryParams,
      }),
      clickhouseClient().query({
        query: `
          SELECT *
          FROM ${TABLE_NAME}
          WHERE workspace_id = {workspaceId: UInt64}
            AND has_error = 0
            AND experiment_id IS NULL
            AND has_passed != 1
            AND has(issue_ids, {issueId: UInt64})
            AND commit_uuid IN ({mergedCommitUuids: Array(UUID)})
          ORDER BY created_at ASC, id ASC, normalized_score ASC
          LIMIT {olderLimit: UInt64}
        `,
        format: 'JSONEachRow',
        query_params: queryParams,
      }),
    ])

    const newerRows = await newerResult.json<EvaluationResultV2Row>()
    const olderRows = await olderResult.json<EvaluationResultV2Row>()

    const results = newerRows.map(mapRow)
    for (const row of olderRows) {
      if (results.find((r) => r.id === Number(row.id))) continue
      results.push(mapRow(row))
    }

    return results
  },
)
