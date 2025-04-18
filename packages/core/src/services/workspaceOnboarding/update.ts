import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaceOnboarding } from '../../schema/models/workspaceOnboarding'

export async function markWorkspaceOnboardingComplete(
  {
    onboarding,
  }: {
    onboarding: typeof workspaceOnboarding.$inferSelect
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const updatedOnboardings = await tx
      .update(workspaceOnboarding)
      .set({
        completedAt: new Date(),
      })
      .where(eq(workspaceOnboarding.id, onboarding.id))
      .returning()

    const updatedOnboarding = updatedOnboardings[0]!

    return Result.ok(updatedOnboarding)
  }, db)
}
