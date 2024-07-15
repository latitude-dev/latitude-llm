import { Database } from '$core/client'
import { Result } from '$core/lib/Result'
import Transaction from '$core/lib/Transaction'
import { memberships, workspaces, type Workspace } from '$core/schema'

export async function createWorkspace({
  db,
  name,
  creatorId,
}: {
  db: Database
  name: string
  creatorId: string
}) {
  return Transaction.call<Workspace>(db, async (trx) => {
    const insertedWorkspaces = await trx
      .insert(workspaces)
      .values({ name, creatorId })
      .returning()

    const newWorkspace = insertedWorkspaces[0]!

    await trx
      .insert(memberships)
      .values({ workspaceId: newWorkspace.id, userId: creatorId })

    return Result.ok(newWorkspace)
  })
}
