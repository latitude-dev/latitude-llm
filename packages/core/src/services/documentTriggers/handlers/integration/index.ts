import { DocumentTriggerType } from '@latitude-data/constants'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { HEAD_COMMIT } from '../../../../browser'
import { database } from '../../../../client'
import {
  unsafelyFindDocumentTrigger,
  unsafelyFindWorkspace,
} from '../../../../data-access'
import { RunDocumentJobData } from '../../../../jobs/job-definitions'
import { documentsQueue } from '../../../../jobs/queues'
import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'

export async function handleIntegrationTrigger(
  {
    triggerUuid,
    payload,
  }: {
    triggerUuid: string
    payload: Record<string, unknown>
  },
  db = database,
): PromisedResult<undefined> {
  const trigger = await unsafelyFindDocumentTrigger(triggerUuid, db)
  if (!trigger) {
    return Result.error(new NotFoundError('Trigger not found'))
  }

  if (trigger.triggerType !== DocumentTriggerType.Integration) {
    return Result.error(new BadRequestError('Invalid trigger type'))
  }

  const workspace = await unsafelyFindWorkspace(trigger.workspaceId, db)

  const triggerConfig = trigger.configuration as IntegrationTriggerConfiguration
  const parameters = Object.fromEntries(
    triggerConfig.payloadParameters.map((paramName) => [paramName, payload]),
  )

  const runJobData: RunDocumentJobData = {
    workspaceId: workspace!.id,
    projectId: trigger.projectId,
    documentUuid: trigger.documentUuid,
    parameters,
    commitUuid: HEAD_COMMIT,
  }

  const job = await documentsQueue.add('runDocumentJob', runJobData)
  if (!job.id) {
    return Result.error(new LatitudeError('Failed to enqueue job'))
  }

  return Result.nil()
}
