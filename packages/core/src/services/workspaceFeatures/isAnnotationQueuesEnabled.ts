import { Database, database } from '../../client'
import { ANNOTATION_QUEUES_FLAG } from './flags'
import { isFeatureEnabledByName } from './isFeatureEnabledByName'

export async function isAnnotationQueuesEnabled(
  workspaceId: number,
  db: Database = database,
) {
  const result = await isFeatureEnabledByName(
    workspaceId,
    ANNOTATION_QUEUES_FLAG,
    db,
  )

  return result.ok && result.value
}
