import { and, eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import { features, workspaceFeatures, workspaces } from '../../schema'

export async function findAllFeaturesWithWorkspaceCounts(db = database) {
  const featuresWithCounts = await db
    .select({
      id: features.id,
      name: features.name,
      description: features.description,
      createdAt: features.createdAt,
      updatedAt: features.updatedAt,
    })
    .from(features)

  // Get workspace names for each feature
  const featuresWithWorkspaces = await Promise.all(
    featuresWithCounts.map(async (feature) => {
      const workspacesResult = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          enabled: workspaceFeatures.enabled,
        })
        .from(workspaceFeatures)
        .innerJoin(workspaces, eq(workspaceFeatures.workspaceId, workspaces.id))
        .where(and(eq(workspaceFeatures.featureId, feature.id)))

      return {
        ...feature,
        workspaceCount: workspacesResult.length,
        workspaces: workspacesResult,
      }
    }),
  )

  return Result.ok(featuresWithWorkspaces)
}
