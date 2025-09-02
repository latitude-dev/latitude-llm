import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import { Commit, DocumentTrigger, DocumentTriggerEvent } from '../../../browser'
import { LatitudeError } from '@latitude-data/constants/errors'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { documentTriggerEvents } from '../../../schema'
import { publisher } from '../../../events/publisher'

export async function createDocumentTriggerEvent<T extends DocumentTriggerType>(
  {
    commit,
    trigger,
    eventPayload,
  }: {
    commit: Commit
    trigger: DocumentTrigger
    eventPayload: DocumentTriggerEventPayload<T>
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTriggerEvent<T>> {
  return transaction.call(
    async (tx) => {
      const [triggerEvent] = (await tx
        .insert(documentTriggerEvents)
        .values({
          workspaceId: trigger.workspaceId,
          triggerUuid: trigger.uuid,
          triggerType: trigger.triggerType,
          commitId: commit.id,
          payload: eventPayload,
        })
        .returning()) as [DocumentTriggerEvent<T>]

      if (!triggerEvent) {
        return Result.error(new LatitudeError('Failed to create trigger event'))
      }

      return Result.ok(triggerEvent)
    },
    (triggerEvent) => {
      publisher.publishLater({
        type: 'documentTriggerEventCreated',
        data: {
          workspaceId: triggerEvent.workspaceId,
          commit,
          documentTriggerEvent: triggerEvent,
        },
      })
    },
  )
}
