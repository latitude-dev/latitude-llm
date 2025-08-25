import { BadRequestError, LatitudeError } from '@latitude-data/constants/errors'
import type { Commit, DocumentTrigger, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { type PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema'
import type { DocumentTriggerType } from '@latitude-data/constants'
import { CommitsRepository, DocumentTriggersRepository } from '../../repositories'
import { eq } from 'drizzle-orm'

/**
 * Enables or disables a document trigger at a given commit.
 */
export async function setDocumentTriggerEnabled<T extends DocumentTriggerType>(
  {
    workspace,
    commit,
    triggerUuid,
    enabled,
  }: {
    workspace: Workspace
    commit: Commit
    triggerUuid: string
    enabled: boolean
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger<T>> {
  return await transaction.call(async (tx) => {
    const commitsScope = new CommitsRepository(workspace.id, tx)
    const liveCommitResult = await commitsScope.getHeadCommit(commit.projectId)
    if (!Result.isOk(liveCommitResult)) return liveCommitResult
    const liveCommit = liveCommitResult.unwrap()

    if (commit.uuid !== liveCommit?.uuid) {
      return Result.error(
        new BadRequestError('A trigger can only be enabled or disabled in the Live commit'),
      )
    }

    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
    const triggerResult = await triggersScope.getTriggerByUuid<T>({
      uuid: triggerUuid,
      commit,
    })
    if (!Result.isOk(triggerResult)) return triggerResult
    const trigger = triggerResult.unwrap()

    if (trigger.deletedAt) {
      return Result.error(new BadRequestError('Cannot enable a deleted trigger'))
    }

    if (trigger.enabled === enabled) {
      return Result.ok(trigger)
    }

    const [updatedTrigger] = (await tx
      .update(documentTriggers)
      .set({
        enabled,
      })
      .where(eq(documentTriggers.id, trigger.id))
      .returning()) as DocumentTrigger<T>[]

    if (!updatedTrigger) {
      return Result.error(new LatitudeError('Failed to update trigger'))
    }

    return Result.ok(updatedTrigger)
  })
}
