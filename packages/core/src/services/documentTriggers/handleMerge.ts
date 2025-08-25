import { BadRequestError } from '@latitude-data/constants/errors'
import type { Commit, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { type PromisedResult } from '../../lib/Transaction'
import { CommitsRepository, DocumentTriggersRepository } from '../../repositories'
import { undeployDocumentTrigger } from './deploy'

/**
 * Handles the merge of a commit that contains document triggers.
 *
 * When a commit is merged, the live version of all triggers that get updated in this commit must be undeployed
 */
export async function handleTriggerMerge(
  {
    workspace,
    draft,
  }: {
    workspace: Workspace
    draft: Commit
  },
  transaction = new Transaction(),
): PromisedResult<undefined> {
  if (draft.mergedAt) {
    return Result.error(new BadRequestError('Cannot merge a merged draft'))
  }

  const liveTriggersToUndeployResult = await transaction.call(async (tx) => {
    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
    const commitsScope = new CommitsRepository(workspace.id, tx)

    const liveCommitResult = await commitsScope.getHeadCommit(draft.projectId)
    if (!Result.isOk(liveCommitResult)) return liveCommitResult

    const liveCommit = liveCommitResult.unwrap()
    if (!liveCommit) return Result.ok([]) // No live commit, no triggers to undeploy

    const triggerUpdatesResult = await triggersScope.getTriggerUpdatesInDraft(draft)
    if (!Result.isOk(triggerUpdatesResult)) return triggerUpdatesResult
    const triggerUpdates = triggerUpdatesResult.unwrap()

    const triggersAtLiveResult = await triggersScope.getTriggersInProject({
      projectId: draft.projectId,
      commit: liveCommit,
    })
    const triggersAtLive = triggersAtLiveResult.unwrap()

    return Result.ok(
      triggersAtLive.filter((trigger) =>
        triggerUpdates.some((update) => update.uuid === trigger.uuid),
      ),
    )
  })

  if (!Result.isOk(liveTriggersToUndeployResult)) {
    return liveTriggersToUndeployResult
  }

  const liveTriggersToUndeploy = liveTriggersToUndeployResult.unwrap()
  for await (const liveTriggerToUndeploy of liveTriggersToUndeploy) {
    const undeployResult = await undeployDocumentTrigger(
      {
        workspace,
        documentTrigger: liveTriggerToUndeploy,
      },
      transaction,
    )

    if (!Result.isOk(undeployResult)) return undeployResult
  }

  return Result.nil()
}
