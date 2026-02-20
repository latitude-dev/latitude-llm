import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

interface ExperimentAggregationsParams {
  workspaceId: number
  projectId: number
  experimentIds?: number[]
  documentUuid?: string
}

export const getExperimentAggregations = scopedQuery(
  async function getExperimentAggregations(
    params: ExperimentAggregationsParams,
  ) {
    const { workspaceId, projectId, experimentIds, documentUuid } = params

    const conditions: string[] = [
      'workspace_id = {workspaceId: UInt64}',
      'project_id = {projectId: UInt64}',
    ]

    const queryParams: Record<string, unknown> = {
      workspaceId,
      projectId,
    }

    if (experimentIds && experimentIds.length > 0) {
      conditions.push(
        'experiment_id IN ({experimentIds: Array(Nullable(UInt64))})',
      )
      queryParams.experimentIds = experimentIds
    }

    if (documentUuid) {
      conditions.push('document_uuid = {documentUuid: UUID}')
      queryParams.documentUuid = documentUuid
    }

    const query = `
      SELECT
        experiment_id,
        count() as total_count,
        countIf(has_passed = 1) as passed_evals,
        countIf(has_passed = 0) as failed_evals,
        countIf(has_error = 1) as eval_errors,
        sum(normalized_score) as total_score
      FROM ${TABLE_NAME}
      WHERE ${conditions.join(' AND ')}
      GROUP BY experiment_id
    `

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: queryParams,
    })

    return result.json<{
      experiment_id: number | null
      total_count: number
      passed_evals: number
      failed_evals: number
      eval_errors: number
      total_score: number | null
    }>()
  },
)
