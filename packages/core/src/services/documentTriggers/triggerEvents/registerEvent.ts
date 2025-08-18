import { DocumentTriggerType } from '@latitude-data/constants'
import {
  Commit,
  DocumentTrigger,
  DocumentTriggerEvent,
  Workspace,
} from '../../../browser'
import { DocumentTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { documentTriggerEvents } from '../../../schema'
import { LatitudeError } from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import { DocumentTriggersRepository } from '../../../repositories'
import { enqueueRunDocumentFromTriggerEventJob } from './runFromEvent'

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
  let documentTrigger: DocumentTrigger<T> | undefined

  const documentTriggerEventResult = await transaction.call(async (tx) => {
    const documentTriggerScope = new DocumentTriggersRepository(
      workspace.id,
      tx,
    )
    const documentTriggerResult = await documentTriggerScope.getTriggerByUuid({
      uuid: triggerUuid,
      commit,
    })

    if (documentTriggerResult.error) {
      return Result.error(documentTriggerResult.error)
    }

    documentTrigger = documentTriggerResult.unwrap() as DocumentTrigger<T>

    // TODO: Implement services/documentTriggerEvents/create.ts service
    const [triggerEvent] = (await tx
      .insert(documentTriggerEvents)
      .values({
        workspaceId: workspace.id,
        triggerUuid: documentTrigger.uuid,
        triggerType: documentTrigger.triggerType,
        commitId: commit.id,
        payload: eventPayload,
      })
      .returning()) as [DocumentTriggerEvent<T>]

    if (!triggerEvent) {
      return Result.error(new LatitudeError('Failed to create trigger event'))
    }

    return Result.ok(triggerEvent)
  })

  if (documentTriggerEventResult.error) return documentTriggerEventResult
  const documentTriggerEvent = documentTriggerEventResult.unwrap()

  // If enabled, run the trigger event automatically
  if (documentTrigger?.enabled) {
    const executeDocumentTriggerEventResult =
      await enqueueRunDocumentFromTriggerEventJob({
        workspace,
        documentTriggerEvent,
      })

    if (executeDocumentTriggerEventResult.error) {
      return executeDocumentTriggerEventResult
    }
  }

  return Result.ok(documentTriggerEvent)
}
