import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaceOnboarding } from '../../schema/models/workspaceOnboarding'
import { workspaces } from '../../schema/models/workspaces'

export async function getWorkspaceOnboarding(
  {
    workspace,
  }: {
    workspace: typeof workspaces.$inferSelect
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const onboardings = await tx
      .select()
      .from(workspaceOnboarding)
      .where(eq(workspaceOnboarding.workspaceId, workspace.id))

    const onboarding = onboardings[0]
    if (!onboarding) {
      return Result.error(new Error('Workspace onboarding not found'))
    }

    return Result.ok(onboarding)
  })
}
