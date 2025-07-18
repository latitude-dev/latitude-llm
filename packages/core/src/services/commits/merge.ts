import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { Commit } from '../../browser'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  LatitudeError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../lib/errors'
import { commits } from '../../schema'
import { recomputeChanges } from '../documents'
import { pingProjectUpdate } from '../projects'

export async function mergeCommit(
  commit: Commit,
  transaction = new Transaction(),
) {
  return transaction.call<Commit>(async (tx) => {
    const mergedAt = new Date()
    const otherCommits = await tx
      .select()
      .from(commits)
      .where(
        and(
          isNull(commits.deletedAt),
          eq(commits.projectId, commit.projectId),
          eq(commits.mergedAt, mergedAt),
        ),
      )
    if (otherCommits.length > 0) {
      return Result.error(
        new LatitudeError(
          'Commit publish the version time conflict, try again',
        ),
      )
    }

    const workspace = await findWorkspaceFromCommit(commit, tx)

    if (!workspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    const recomputedResults = await recomputeChanges(
      { draft: commit, workspace },
      transaction,
    )

    if (recomputedResults.error) return recomputedResults
    if (Object.keys(recomputedResults.value.errors).length > 0) {
      return Result.error(
        new UnprocessableEntityError(
          'There are errors in the updated documents in this version',
          {
            [commit.id]: [
              'There are errors in the updated documents in this version',
            ],
          },
        ),
      )
    }

    if (Object.keys(recomputedResults.value.changedDocuments).length === 0) {
      return Result.error(
        new UnprocessableEntityError(
          'Cannot publish a version with no changes.',
          {
            [commit.id]: ['Cannot publish a version with no changes.'],
          },
        ),
      )
    }

    const lastMergedCommit = await tx.query.commits.findFirst({
      where: and(
        isNotNull(commits.version),
        eq(commits.projectId, commit.projectId),
      ),
      orderBy: desc(commits.version),
    })
    const version = (lastMergedCommit?.version ?? 0) + 1

    const result = await tx
      .update(commits)
      .set({ mergedAt, version })
      .where(eq(commits.id, commit.id))
      .returning()
    const updatedCommit = result[0]!

    await pingProjectUpdate(
      {
        projectId: commit.projectId,
      },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok(updatedCommit)
  })
}
