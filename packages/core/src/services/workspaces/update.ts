import { Result, Transaction } from '$core/lib'
import { Workspace, workspaces } from '$core/schema'
import { eq } from 'drizzle-orm'

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
