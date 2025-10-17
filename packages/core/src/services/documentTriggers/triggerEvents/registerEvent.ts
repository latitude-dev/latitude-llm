import { DocumentTriggerType } from '@latitude-data/constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentTriggerEvent } from '../../../schema/models/types/DocumentTriggerEvent'
import { type Workspace } from '../../../schema/models/types/Workspace'
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
  return transaction.call(
    async (db) => {
      const triggerScope = new DocumentTriggersRepository(workspace.id, db)
      const triggerResult = await triggerScope.getTriggerByUuid({
        uuid: triggerUuid,
        commit,
      })
      if (triggerResult.error) return triggerResult

      const trigger = triggerResult.value
      const eventResult = await createDocumentTriggerEvent(
        {
          commit,
          trigger,
          eventPayload,
        },
        transaction,
      )

      if (eventResult.error) return eventResult

      const event = eventResult.value

      return Result.ok(event)
    },
    async (event) => {
      await enqueueRunDocumentFromTriggerEventJob({
        workspace,
        documentTriggerEvent: event,
        commit,
      })
    },
  )
}
