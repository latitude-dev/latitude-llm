import { eq, and } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaceFeatures } from '../../schema'

export async function toggleWorkspaceFeature(
  workspaceId: number,
  featureId: number,
  enabled: boolean,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    // Check if the workspace feature already exists
    const existing = await tx
      .select()
      .from(workspaceFeatures)
      .where(
        and(
          eq(workspaceFeatures.workspaceId, workspaceId),
          eq(workspaceFeatures.featureId, featureId),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      // Update existing record
      const [updated] = await tx
        .update(workspaceFeatures)
        .set({ enabled })
        .where(
          and(
            eq(workspaceFeatures.workspaceId, workspaceId),
            eq(workspaceFeatures.featureId, featureId),
          ),
        )
        .returning()

      return Result.ok(updated!)
    } else {
      // Create new record
      const [created] = await tx
        .insert(workspaceFeatures)
        .values({
          workspaceId,
          featureId,
          enabled,
        })
        .returning()

      return Result.ok(created!)
    }
  })
}
