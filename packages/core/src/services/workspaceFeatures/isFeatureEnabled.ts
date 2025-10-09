import { eq, and } from 'drizzle-orm'

import { database } from '../../client'
import { features } from '../../schema/models/features'
import { workspaceFeatures } from '../../schema/models/workspaceFeatures'

export async function isFeatureEnabled(
  workspaceId: number,
  featureId: number,
  db = database,
) {
  // First check if the feature is globally enabled
  const feature = await db
    .select()
    .from(features)
    .where(eq(features.id, featureId))
    .limit(1)

  if (feature.length > 0 && feature[0]!.enabled) {
    return true // Feature is globally enabled
  }

  // If not globally enabled, check workspace-specific setting
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
