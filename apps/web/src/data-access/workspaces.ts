import {
  database,
  NotFoundError,
  Result,
  workspaces,
} from '@latitude-data/core'
import { eq } from 'drizzle-orm'

export async function getWorkspace({ userId }: { userId: string }) {
  const workspace = await database.query.workspaces.findFirst({
    where: eq(workspaces.creatorId, userId),
  })

  if (!workspace) {
    return Result.error(new NotFoundError('Workspace not found'))
  }

  return Result.ok(workspace)
}

export async function isWorkspaceCreated(db = database) {
  const workspace = await db.query.workspaces.findFirst()

  return workspace !== undefined
}
