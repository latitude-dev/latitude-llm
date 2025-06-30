import { createBackendClient } from '@pipedream/sdk'
import { IntegrationDto } from '../../../browser'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getPipedreamEnvironment } from './apps'
import { IntegrationType } from '@latitude-data/constants'

export async function destroyPipedreamAccountFromIntegration(
  integration: IntegrationDto,
): PromisedResult<undefined> {
  if (integration.type !== IntegrationType.Pipedream) {
    return Result.nil()
  }

  const pipedreamEnv = getPipedreamEnvironment()
  if (!Result.isOk(pipedreamEnv)) {
    return pipedreamEnv
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    await pipedream.deleteAccount(integration.configuration.connectionId)
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
