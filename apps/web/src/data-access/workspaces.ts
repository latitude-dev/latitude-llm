import { unsafelyFindWorkspacesFromUser } from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'

export async function getFirstWorkspace({ userId }: { userId: string }) {
  const workspaces = await unsafelyFindWorkspacesFromUser(userId)
  const workspace = workspaces[0]
  if (!workspace) {
    return Result.error(new NotFoundError('Workspace not found'))
  }

  return Result.ok(workspace)
}
