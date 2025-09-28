import { IntegrationDto } from '../../../schema/types'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getPipedreamClient } from './apps'
import { IntegrationType } from '@latitude-data/constants'
import { isIntegrationConfigured } from './components/reloadComponentProps'

export async function destroyPipedreamAccountFromIntegration(
  integration: IntegrationDto,
): PromisedResult<undefined> {
  if (integration.type !== IntegrationType.Pipedream) {
    return Result.nil()
  }

  if (!isIntegrationConfigured(integration)) {
    return Result.nil() // Not configured, nothing to destroy
  }

  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) {
    return pipedreamResult
  }
  const pipedream = pipedreamResult.unwrap()

  try {
    await pipedream.users.deleteExternalUser(
      integration.configuration.externalUserId,
    )
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
