import { unsafelyFindWorkspacesFromUser } from '@latitude-data/core'
import { NotFoundError } from '@latitude-data/core'
import { Result } from '@latitude-data/core'

export async function getFirstWorkspace({ userId }: { userId: string }) {
  const workspaces = await unsafelyFindWorkspacesFromUser(userId)
  const workspace = workspaces[0]
  if (!workspace) {
    return Result.error(new NotFoundError('Workspace not found'))
  }

  return Result.ok(workspace)
}
