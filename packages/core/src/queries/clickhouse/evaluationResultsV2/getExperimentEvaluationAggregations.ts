import { clickhouseClient } from '../../../client/clickhouse'
import { TABLE_NAME } from '../../../schema/models/clickhouse/evaluationResults'
import { scopedQuery } from '../../scope'

interface ExperimentEvaluationAggregationsParams {
  workspaceId: number
  projectId: number
  experimentUuids: string[]
}

export const getExperimentEvaluationAggregations = scopedQuery(
  async function getExperimentEvaluationAggregations(
    params: ExperimentEvaluationAggregationsParams,
  ) {
    const { workspaceId, projectId, experimentUuids } = params

    const query = `
      SELECT
        experiment_id,
        evaluation_uuid,
        count() as count,
        sum(score) as total_score,
        sum(normalized_score) as total_normalized_score
      FROM ${TABLE_NAME}
      WHERE workspace_id = {workspaceId: UInt64}
        AND project_id = {projectId: UInt64}
        AND experiment_id IS NOT NULL
        AND evaluation_uuid IN ({evaluationUuids: Array(UUID)})
      GROUP BY experiment_id, evaluation_uuid
    `

    const result = await clickhouseClient().query({
      query,
      format: 'JSONEachRow',
      query_params: {
        workspaceId,
        projectId,
        evaluationUuids: experimentUuids,
      },
    })

    return result.json<{
      experiment_id: number | null
      evaluation_uuid: string
      count: number
      total_score: number | null
      total_normalized_score: number | null
    }>()
  },
)
