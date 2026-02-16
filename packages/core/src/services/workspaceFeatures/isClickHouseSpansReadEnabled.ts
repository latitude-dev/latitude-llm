import { Database, database } from '../../client'
import { CLICKHOUSE_SPANS_READ_FLAG } from './flags'
import { isFeatureEnabledByName } from './isFeatureEnabledByName'

export async function isClickHouseSpansReadEnabled(
  workspaceId: number,
  db: Database = database,
) {
  const result = await isFeatureEnabledByName(
    workspaceId,
    CLICKHOUSE_SPANS_READ_FLAG,
    db,
  )

  return result.ok && result.value
}
