import { createBackendClient } from '@pipedream/sdk'
import { IntegrationDto } from '../../../browser'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getPipedreamEnvironment } from './apps'
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

  const pipedreamEnv = getPipedreamEnvironment()
  if (!Result.isOk(pipedreamEnv)) {
    return pipedreamEnv
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    await pipedream.deleteExternalUser(integration.configuration.externalUserId)
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
