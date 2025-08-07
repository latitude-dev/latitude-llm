import { and, eq } from 'drizzle-orm'

import { database } from '../../client'
import { workspaceFeatures } from '../../schema'

export async function isFeatureEnabled(
  workspaceId: number,
  featureId: number,
  db = database,
) {
  const workspaceFeature = await db
    .select()
    .from(workspaceFeatures)
    .where(
      and(
        eq(workspaceFeatures.workspaceId, workspaceId),
        eq(workspaceFeatures.featureId, featureId),
      ),
    )
    .limit(1)

  // If no record exists, feature is disabled by default
  const enabled =
    workspaceFeature.length > 0 ? workspaceFeature[0]!.enabled : false

  return enabled
}
