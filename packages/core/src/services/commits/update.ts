import { eq } from 'drizzle-orm'

import { Commit, Workspace } from '../../schema/types'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { commits } from '../../schema/models/commits'
import { publisher } from '../../events/publisher'

export async function updateCommit(
  {
    workspace,
    commit,
    data,
  }: {
    workspace: Workspace
    commit: Commit
    data: {
      title?: string
      description?: string | null
      mainDocumentUuid?: string | null
    }
  },
  transaction = new Transaction(),
): Promise<TypedResult<Commit, Error>> {
  return transaction.call<Commit>(async (tx) => {
    const assertResult = assertCommitIsDraft(commit)
    if (assertResult.error) return assertResult

    if (Object.keys(data).length === 0) {
      return Result.error(
        new BadRequestError('No updates provided for the commit'),
      )
    }

    const [updatedCommit] = await tx
      .update(commits)
      .set(data)
      .where(eq(commits.id, commit.id))
      .returning()

    if (!updatedCommit) {
      return Result.error(new NotFoundError('Commit not found'))
    }

    publisher.publishLater({
      type: 'commitUpdated',
      data: {
        workspaceId: workspace.id,
        commit: updatedCommit,
      },
    })

    return Result.ok(updatedCommit!)
  })
}
