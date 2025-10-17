import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaceOnboarding } from '../../schema/models/workspaceOnboarding'
import { type Workspace } from '../../schema/models/types/Workspace'

export async function createWorkspaceOnboarding(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const insertedOnboardings = await tx
      .insert(workspaceOnboarding)
      .values({
        workspaceId: workspace.id,
      })
      .returning()

    const onboarding = insertedOnboardings[0]!

    return Result.ok(onboarding)
  })
}
