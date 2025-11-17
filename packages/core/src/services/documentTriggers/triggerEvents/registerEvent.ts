import {
  DocumentTriggerStatus,
  DocumentTriggerType,
} from '@latitude-data/constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentTriggerEvent } from '../../../schema/models/types/DocumentTriggerEvent'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { DocumentTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { DocumentTriggersRepository } from '../../../repositories'
import { enqueueRunDocumentFromTriggerEventJob } from './enqueueRunDocumentFromTriggerEventJob'
import { createDocumentTriggerEvent } from './create'
import { DocumentTrigger } from '../../../schema/models/types/DocumentTrigger'

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
  let trigger: DocumentTrigger<T> | undefined = undefined

  return transaction.call(
    async (db) => {
      const triggerScope = new DocumentTriggersRepository(workspace.id, db)
      const triggerResult = await triggerScope.getTriggerByUuid({
        uuid: triggerUuid,
        commit,
      })
      if (triggerResult.error) return triggerResult

      trigger = triggerResult.unwrap() as DocumentTrigger<T>
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
      if (!trigger) return
      if (!trigger.enabled) return
      if (trigger.deletedAt) return
      if (trigger.triggerStatus !== DocumentTriggerStatus.Deployed) return

      await enqueueRunDocumentFromTriggerEventJob({
        workspace,
        documentTriggerEvent: event,
        commit,
      })
    },
  )
}
