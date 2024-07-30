import {
  database,
  memberships,
  Result,
  Transaction,
  workspaces,
  type Workspace,
} from '@latitude-data/core'
import { createProject } from '$core/services/projects'

import { createApiKey } from '../apiKeys/create'

export async function createWorkspace(
  {
    name,
    creatorId,
  }: {
    name: string
    creatorId: string
  },
  db = database,
) {
  return Transaction.call<Workspace>(async (tx) => {
    const insertedWorkspaces = await tx
      .insert(workspaces)
      .values({ name, creatorId })
      .returning()

    const newWorkspace = insertedWorkspaces[0]!
    await tx
      .insert(memberships)
      .values({ workspaceId: newWorkspace.id, userId: creatorId })

    await createProject({ workspaceId: newWorkspace.id }, tx)
    await createApiKey({ workspace: newWorkspace }, tx)

    return Result.ok(newWorkspace)
  }, db)
}
