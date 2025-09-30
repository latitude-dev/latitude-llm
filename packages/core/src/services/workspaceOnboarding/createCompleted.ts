import Transaction from '../../lib/Transaction'
import { Result } from '../../lib/Result'
import { workspaceOnboarding } from '../../schema/models/workspaceOnboarding'

export async function createCompletedWorkspaceOnboarding(
  {
    workspaceId,
  }: {
    workspaceId: number
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const insertedOnboardings = await tx
      .insert(workspaceOnboarding)
      .values({ workspaceId, completedAt: new Date() })
      .returning()
    const onboarding = insertedOnboardings[0]!
    return Result.ok(onboarding)
  })
}
