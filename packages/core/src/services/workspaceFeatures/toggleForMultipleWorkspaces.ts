import { and, eq, inArray } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import { workspaceFeatures } from '../../schema'
import Transaction from '../../lib/Transaction'

export async function toggleWorkspaceFeatureForMultipleWorkspaces(
  featureId: number,
  workspaceIds: number[],
  enabled: boolean,
  db = database,
) {
  return Transaction.call(async (tx) => {
    if (enabled) {
      // Enable feature for specified workspaces
      const values = workspaceIds.map((workspaceId) => ({
        featureId,
        workspaceId,
        enabled: true,
      }))

      await tx
        .insert(workspaceFeatures)
        .values(values)
        .onConflictDoUpdate({
          target: [workspaceFeatures.workspaceId, workspaceFeatures.featureId],
          set: { enabled: true },
        })
    } else {
      // Disable feature for specified workspaces
      await tx
        .update(workspaceFeatures)
        .set({ enabled: false })
        .where(
          and(
            eq(workspaceFeatures.featureId, featureId),
            inArray(workspaceFeatures.workspaceId, workspaceIds),
          ),
        )
    }

    return Result.ok({ featureId, workspaceIds, enabled })
  }, db)
}
