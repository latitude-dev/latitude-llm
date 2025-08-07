import { IntegrationType } from '@latitude-data/constants'
import type { IntegrationDto } from '../../../browser'
import type { PromisedResult } from '../../../lib/Transaction'
import { LatitudeError, NotImplementedError } from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import { listPipedreamIntegrationTriggers } from '../pipedream/listTriggers'

export async function listTriggers(integration: IntegrationDto): PromisedResult<
  {
    name: string
    description?: string
  }[],
  LatitudeError
> {
  if (integration.type === IntegrationType.Pipedream) {
    const triggerResult = await listPipedreamIntegrationTriggers(integration)
    if (!Result.isOk(triggerResult)) {
      return Result.error(new LatitudeError(triggerResult.error.message))
    }

    const triggers = triggerResult.unwrap()
    return Result.ok(triggers)
  }

  // As Latitude is an integration, we must return its triggers
  if (integration.type === IntegrationType.Latitude) {
    const scheduledTrigger = {
      name: 'Scheduled Trigger',
      description: 'Trigger that runs on a schedule',
    }

    const emailTrigger = {
      name: 'Email Trigger',
      description: 'Trigger that runs when an email is received',
    }

    return Result.ok([scheduledTrigger, emailTrigger])
  }

  return Result.error(new NotImplementedError('Unsupported integration type'))
}
