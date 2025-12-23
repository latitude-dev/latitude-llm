import { IntegrationDto } from '../../../schema/models/types/Integration'
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

  const externalUserId = integration.configuration.externalUserId
  const accountId = integration.configuration.connectionId

  try {
    // List all integrations from the external user
    const currentIntegrations = await pipedream.accounts.list({
      externalUserId,
    })

    // If there is only THE ONE integration, we can delete the external user
    if (
      currentIntegrations.data.length === 1 &&
      currentIntegrations.data[0]!.id === accountId
    ) {
      await pipedream.users.deleteExternalUser(
        integration.configuration.externalUserId,
      )
      return Result.nil()
    }

    // Otherwise, remove only the account from the user
    await pipedream.accounts.delete(accountId)
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
