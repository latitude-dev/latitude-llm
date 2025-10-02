import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaceOnboarding } from '../../schema/models/WorkspaceOnboarding'

export async function createWorkspaceOnboarding(
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
      .values({
        workspaceId,
      })
      .returning()

    const onboarding = insertedOnboardings[0]!

    return Result.ok(onboarding)
  })
}
