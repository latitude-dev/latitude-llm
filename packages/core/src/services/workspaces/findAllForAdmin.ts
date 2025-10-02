import { database } from '../../client'
import { Result } from '../../lib/Result'
import { workspaces } from '../../schema/models/workspaces'

export async function findAllWorkspacesForAdmin(db = database) {
  const allWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .orderBy(workspaces.name)

  return Result.ok(allWorkspaces)
}
