import { eq } from 'drizzle-orm'
import { MembershipsRepository } from '../../../repositories'
import { Result } from '../../../lib'
import { Workspace } from '../../../browser'
import { database } from '../../../client'
import { users } from '../../../schema'

export async function getWorkspaceCreator(workspace: Workspace, db = database) {
  const repo = new MembershipsRepository(workspace.id, db)
  const result = await repo.findFirst()

  if (result.error) return Result.error(result.error)
  const membership = result.value

  if (!membership) {
    return Result.error(
      new Error(`0 Memberships found in workspace ${workspace.id}`),
    )
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, membership.userId),
  })

  if (!user) {
    return Result.error(
      new Error(
        `User not found with id ${membership.userId} in workspace ${workspace.id}`,
      ),
    )
  }

  return Result.ok(user)
}
