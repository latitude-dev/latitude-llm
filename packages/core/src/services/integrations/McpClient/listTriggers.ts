import { PromisedResult } from '../../../lib/Transaction'
import { NotImplementedError } from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import { listPipedreamIntegrationTriggers } from '../pipedream/listTriggers'
import { IntegrationType } from '@latitude-data/constants'

export async function listTriggers({
  integrationType,
  appName,
}: {
  integrationType: IntegrationType
  appName: string
}): PromisedResult<
  {
    name: string
    description?: string
  }[]
> {
  // As Latitude is an integration, we must return its triggers
  if (integrationType === IntegrationType.Latitude) {
    const scheduledTrigger = {
      name: 'Scheduled Trigger',
      description: 'Trigger that runs on a schedule',
    }

    const emailTrigger = {
      name: 'Email Trigger',
      description: 'Trigger that runs when an email is received',
    }

    const chatTrigger = {
      name: 'Chat Trigger',
      description: 'Trigger that runs when a chat message is received',
    }

    return Result.ok([scheduledTrigger, emailTrigger, chatTrigger])
  }

  if (integrationType === IntegrationType.Pipedream) {
    const triggerResult = await listPipedreamIntegrationTriggers(appName)
    if (!Result.isOk(triggerResult)) return triggerResult
    const triggers = triggerResult.value
    return Result.ok(triggers)
  }

  return Result.error(new NotImplementedError('Unsupported integration type'))
}
