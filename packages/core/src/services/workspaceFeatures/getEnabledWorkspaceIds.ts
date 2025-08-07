import { and, eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import { workspaceFeatures } from '../../schema'

export async function getEnabledWorkspaceIdsForFeature(
  featureId: number,
  db = database,
) {
  const enabledWorkspaces = await db
    .select({
      workspaceId: workspaceFeatures.workspaceId,
    })
    .from(workspaceFeatures)
    .where(
      and(
        eq(workspaceFeatures.featureId, featureId),
        eq(workspaceFeatures.enabled, true),
      ),
    )

  return Result.ok(enabledWorkspaces.map((w) => w.workspaceId))
}
