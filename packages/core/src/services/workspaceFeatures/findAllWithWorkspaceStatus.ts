import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import { features } from '../../schema/models/features'
import { workspaceFeatures } from '../../schema/models/workspaceFeatures'

export async function findAllFeaturesWithWorkspaceStatus(
  workspaceId: number,
  db = database,
) {
  const allFeatures = await db
    .select({
      id: features.id,
      name: features.name,
      description: features.description,
      createdAt: features.createdAt,
      updatedAt: features.updatedAt,
      enabled: workspaceFeatures.enabled,
    })
    .from(features)
    .leftJoin(
      workspaceFeatures,
      eq(features.id, workspaceFeatures.featureId) &&
        eq(workspaceFeatures.workspaceId, workspaceId),
    )

  // Map the results to include a default enabled value of false
  const featuresWithStatus = allFeatures.map((feature) => ({
    ...feature,
    enabled: feature.enabled ?? false,
  }))

  return Result.ok(featuresWithStatus)
}
