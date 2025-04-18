import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaceOnboarding } from '../../schema/models/workspaceOnboarding'
import { workspaces } from '../../schema/models/workspaces'

export async function createWorkspaceOnboarding(
  {
    workspace,
  }: {
    workspace: typeof workspaces.$inferSelect
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const insertedOnboardings = await tx
      .insert(workspaceOnboarding)
      .values({
        workspaceId: workspace.id,
      })
      .returning()

    const onboarding = insertedOnboardings[0]!

    return Result.ok(onboarding)
  }, db)
}
