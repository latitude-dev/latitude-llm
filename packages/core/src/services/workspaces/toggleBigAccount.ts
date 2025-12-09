import { eq } from 'drizzle-orm'

import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema/models/workspaces'

type ToggleBigAccountArgs = {
  workspace: Workspace
  enabled: boolean
}

/**
 * Toggle the isBigAccount flag for a workspace
 * This flag is used to restrict data analytics on workspaces with too many data
 * as a temporary measure while we scale the platform
 */
export async function toggleBigAccount(
  args: ToggleBigAccountArgs,
  transaction = new Transaction(),
) {
  return transaction.call<Workspace>(async (tx) => {
    const updated = await tx
      .update(workspaces)
      .set({ isBigAccount: args.enabled })
      .where(eq(workspaces.id, args.workspace.id))
      .returning()
      .then((r) => r[0])

    return Result.ok(updated)
  })
}
