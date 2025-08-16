import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { Commit, Workspace } from '../../browser'
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
import { handleTriggerMerge } from '../documentTriggers/handleMerge'
import {
  DocumentTriggersRepository,
  EvaluationsV2Repository,
} from '../../repositories'

export async function mergeCommit(
  commit: Commit,
  transaction = new Transaction(),
) {
  const mergedAt = new Date()

  // Phase 1: requirements validation in a short transaction
  const validationResult = await transaction.call<Workspace>(async (tx) => {
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
    const documentChanges = recomputedResults.unwrap().changedDocuments

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

    const evaluationsScope = new EvaluationsV2Repository(workspace.id, tx)
    const evaluationChangesResult =
      await evaluationsScope.getChangesInCommit(commit)
    if (!Result.isOk(evaluationChangesResult)) return evaluationChangesResult
    const evaluationChanges = evaluationChangesResult.unwrap()

    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
    const triggerChangesResult =
      await triggersScope.getTriggerUpdatesInDraft(commit)
    if (!Result.isOk(triggerChangesResult)) return triggerChangesResult
    const triggerChanges = triggerChangesResult.unwrap()

    const totalChanges =
      evaluationChanges.length + triggerChanges.length + documentChanges.length

    if (totalChanges === 0) {
      return Result.error(
        new UnprocessableEntityError(
          'Cannot publish a version with no changes.',
          {
            [commit.id]: ['Cannot publish a version with no changes.'],
          },
        ),
      )
    }

    return Result.ok(workspace)
  })

  if (!Result.isOk(validationResult)) return validationResult
  const workspace = validationResult.unwrap()

  // Phase 2: handle trigger merge outside of any active transaction
  const handleTriggerMergeResult = await handleTriggerMerge(
    {
      workspace,
      draft: commit,
    },
    transaction,
  )
  if (!Result.isOk(handleTriggerMergeResult)) return handleTriggerMergeResult

  // Phase 3: finalize merge in a new short transaction
  return transaction.call<Commit>(async (tx) => {
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
