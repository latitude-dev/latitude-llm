import { User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { workspaces } from '../../schema'

export async function createWorkspace(
  {
    name,
    user,
  }: {
    name: string
    user: User
  },
  db = database,
) {
  return Transaction.call<Workspace>(async (tx) => {
    const insertedWorkspaces = await tx
      .insert(workspaces)
      .values({ name, creatorId: user.id })
      .returning()
    const workspace = insertedWorkspaces[0]!

    publisher.publishLater({
      type: 'workspaceCreated',
      data: { workspace, user },
    })

    return Result.ok(workspace)
  }, db)
}
