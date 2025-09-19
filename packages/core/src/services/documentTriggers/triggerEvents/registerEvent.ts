import { DocumentTriggerType } from '@latitude-data/constants'
import { Commit, DocumentTriggerEvent, Workspace } from '../../../browser'
import { DocumentTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { DocumentTriggersRepository } from '../../../repositories'
import { enqueueRunDocumentFromTriggerEventJob } from './enqueueRunDocumentFromTriggerEventJob'
import { createDocumentTriggerEvent } from './create'

/**
 * Registers and incoming document trigger event, and enqueues a job to execute the trigger if the trigger is enabled.
 */
export async function registerDocumentTriggerEvent<
  T extends DocumentTriggerType,
>(
  {
    workspace,
    triggerUuid,
    commit,
    eventPayload,
  }: {
    workspace: Workspace
    triggerUuid: string
    commit: Commit
    eventPayload: DocumentTriggerEventPayload<T>
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTriggerEvent<T>> {
  return transaction.call(async (db) => {
    const triggerScope = new DocumentTriggersRepository(workspace.id, db)
    const triggerResult = await triggerScope.getTriggerByUuid({
      uuid: triggerUuid,
      commit,
    })

    if (!Result.isOk(triggerResult)) return triggerResult

    const trigger = triggerResult.unwrap()
    const eventResult = await createDocumentTriggerEvent(
      {
        commit,
        trigger,
        eventPayload,
      },
      transaction,
    )

    if (!Result.isOk(eventResult)) return eventResult

    const event = eventResult.unwrap()

    // If enabled, run the trigger event automatically
    if (trigger.enabled) {
      const enqueuedResult = await enqueueRunDocumentFromTriggerEventJob({
        workspace,
        documentTriggerEvent: event,
        commit,
      })

      if (!Result.isOk(enqueuedResult)) return enqueuedResult
    }

    return Result.ok(event)
  })
}
