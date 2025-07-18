import { eq } from 'drizzle-orm'

import type { Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema'

export async function updateWorkspace(
  workspace: Workspace,
  values: {
    name?: string
    defaultProviderId?: number | null
  },
  transaction = new Transaction(),
) {
  return transaction.call<Workspace>(async (tx) => {
    const updated = await tx
      .update(workspaces)
      .set(values)
      .where(eq(workspaces.id, workspace.id))
      .returning()

    return Result.ok(updated[0]!)
  })
}
