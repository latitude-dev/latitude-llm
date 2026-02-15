import { Database, database } from '../client'
import { captureException } from '../utils/datadogCapture'
import { isFeatureEnabledByName } from '../services/workspaceFeatures/isFeatureEnabledByName'
import { SpansRepository } from './spansRepository'

export async function createSpansRepository(
  workspaceId: number,
  db: Database = database,
): Promise<SpansRepository> {
  let useClickHouse = false

  try {
    const result = await isFeatureEnabledByName(
      workspaceId,
      'clickhouse-spans-read',
      db,
    )
    useClickHouse = result.ok ? result.value : false
  } catch (error) {
    captureException(error as Error)
  }

  return new SpansRepository(workspaceId, db, { useClickHouse })
}
