import { eq } from 'drizzle-orm'

import type { Workspace } from '../../browser'
import { Result, Transaction } from '../../lib'
import { workspaces } from '../../schema'

export async function updateWorkspace({
  workspace,
  name,
}: {
  workspace: Workspace
  name: string
}) {
  return await Transaction.call(async (tx) => {
    const updated = await tx
      .update(workspaces)
      .set({ name })
      .where(eq(workspaces.id, workspace.id))
      .returning()

    return Result.ok(updated[0])
  })
}
