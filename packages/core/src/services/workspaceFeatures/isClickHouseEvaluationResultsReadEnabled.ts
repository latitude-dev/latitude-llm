import { Database, database } from '../../client'
import { CLICKHOUSE_EVALUATION_RESULTS_READ_FLAG } from './flags'
import { isFeatureEnabledByName } from './isFeatureEnabledByName'

export async function isClickHouseEvaluationResultsReadEnabled(
  workspaceId: number,
  db: Database = database,
) {
  const result = await isFeatureEnabledByName(
    workspaceId,
    CLICKHOUSE_EVALUATION_RESULTS_READ_FLAG,
    db,
  )

  return result.ok && result.value
}
