import { SafeUser, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { memberships, workspaces } from '../../schema'
import { createApiKey } from '../apiKeys/create'
import { createProject } from '../projects'

export async function createWorkspace(
  {
    name,
    user,
  }: {
    name: string
    user: SafeUser
  },
  db = database,
) {
  return Transaction.call<Workspace>(async (tx) => {
    const insertedWorkspaces = await tx
      .insert(workspaces)
      .values({ name, creatorId: user.id })
      .returning()

    const workspace = insertedWorkspaces[0]!
    await tx
      .insert(memberships)
      .values({ workspaceId: workspace.id, userId: user.id })
    await createProject({ workspace, user }, tx)
    await createApiKey({ workspace }, tx)

    return Result.ok(workspace)
  }, db)
}
