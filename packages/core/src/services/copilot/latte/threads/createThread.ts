import { LatteThread, User, Workspace } from '../../../../browser'
import { database } from '../../../../client'
import { Result } from '../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../lib/Transaction'
import { latteThreads } from '../../../../schema'

export function createLatteThread(
  {
    user,
    workspace,
  }: {
    user: User
    workspace: Workspace
  },
  db = database,
): PromisedResult<LatteThread> {
  return Transaction.call<LatteThread>(async (tx) => {
    const thread = await tx
      .insert(latteThreads)
      .values({
        userId: user.id,
        workspaceId: workspace.id,
      })
      .returning()
      .then((r) => r[0])

    if (!thread) {
      return Result.error(new Error('Failed to create latte thread'))
    }

    return Result.ok(thread!)
  }, db)
}
