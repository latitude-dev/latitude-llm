import { BadRequestError } from '@latitude-data/constants/errors'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentTriggersRepository,
} from '../../repositories'
import { undeployDocumentTrigger } from './deploy'
import { DocumentTriggerStatus } from '@latitude-data/constants'

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

  const triggersToUpdateResult = await transaction.call(async (tx) => {
    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
    const commitsScope = new CommitsRepository(workspace.id, tx)

    const liveCommit = await commitsScope.getHeadCommit(draft.projectId)
    const triggerUpdatesResult =
      await triggersScope.getTriggerUpdatesInDraft(draft)
    if (!Result.isOk(triggerUpdatesResult)) return triggerUpdatesResult
    const triggerUpdates = triggerUpdatesResult.unwrap()

    if (!liveCommit)
      return Result.ok({
        updatedTriggers: triggerUpdates,
        liveTriggersToUndeploy: [], // No live commit, no triggers to undeploy
      })

    const triggersAtLiveResult = await triggersScope.getTriggersInProject({
      projectId: draft.projectId,
      commit: liveCommit,
    })
    const triggersAtLive = triggersAtLiveResult.unwrap()

    const liveTriggersToUndeploy = triggersAtLive.filter((trigger) =>
      triggerUpdates.some((update) => update.uuid === trigger.uuid),
    )

    return Result.ok({
      updatedTriggers: triggerUpdates,
      liveTriggersToUndeploy,
    })
  })

  if (!Result.isOk(triggersToUpdateResult)) {
    return triggersToUpdateResult
  }

  const { updatedTriggers, liveTriggersToUndeploy } =
    triggersToUpdateResult.unwrap()

  if (
    updatedTriggers.some(
      (trigger) => trigger.triggerStatus === DocumentTriggerStatus.Pending,
    )
  ) {
    return Result.error(
      new BadRequestError(
        'Cannot merge a commit that contains pending triggers',
      ),
    )
  }

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
