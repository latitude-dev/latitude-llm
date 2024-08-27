import {
  database,
  NotFoundError,
  Result,
  workspaces,
} from '@latitude-data/core'
import { eq } from 'drizzle-orm'

export async function getWorkspace({ userId }: { userId: string }) {
  // TODO: move to core
  const workspace = await database.query.workspaces.findFirst({
    // NOTE: Typescript gets a little bit confused here. Not really a big
    // deal. Please make keep this comment here when you are done trying and
    // failing to fix this.
    //
    // @ts-ignore
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
