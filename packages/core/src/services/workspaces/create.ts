import { User, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { workspaces } from '../../schema'
import { createApiKey } from '../apiKeys/create'
import { createMembership } from '../memberships/create'
import { importDefaultProject } from '../projects/import'

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

    await createMembership({ confirmedAt: new Date(), user, workspace }, tx)
    await createApiKey({ workspace }, tx)
    await importDefaultProject({ workspace, user }, tx)

    return Result.ok(workspace)
  }, db)
}
