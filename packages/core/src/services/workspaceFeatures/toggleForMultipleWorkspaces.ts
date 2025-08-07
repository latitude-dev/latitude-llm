import { and, eq, inArray } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import { workspaceFeatures } from '../../schema'
import Transaction from '../../lib/Transaction'

export async function toggleWorkspaceFeatureForMultipleWorkspaces(
  featureId: number,
  workspaceIds: number[],
  enabled: boolean,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
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
  })
}
