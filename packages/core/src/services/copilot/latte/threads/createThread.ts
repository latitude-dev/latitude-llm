import { LatteThread, User, Workspace, Project } from '../../../../schema/types'
import { Result } from '../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../lib/Transaction'
import { latteThreads } from '../../../../schema/models/latteThreads'
import { cache as redis } from '../../../../cache'
import { LAST_LATTE_THREAD_CACHE_KEY } from '../../../../constants'

export function createLatteThread(
  {
    user,
    workspace,
    project,
  }: {
    user: User
    workspace: Workspace
    project: Project
  },
  transaction = new Transaction(),
): PromisedResult<LatteThread> {
  return transaction.call<LatteThread>(async (tx) => {
    const thread = await tx
      .insert(latteThreads)
      .values({
        userId: user.id,
        workspaceId: workspace.id,
        projectId: project.id,
      })
      .returning()
      .then((r) => r[0])

    if (!thread) {
      return Result.error(new Error('Failed to create latte thread'))
    }

    const client = await redis()
    await client.set(
      LAST_LATTE_THREAD_CACHE_KEY(workspace.id, user.id, project.id),
      thread.uuid,
    )

    return Result.ok(thread!)
  })
}
