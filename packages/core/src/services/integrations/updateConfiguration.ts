import { IntegrationDto } from '../../browser'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { PipedreamIntegrationConfiguration } from './helpers/schema'
import { IntegrationType } from '@latitude-data/constants'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { isIntegrationConfigured } from './pipedream/components/fillConfiguredProps'
import { integrations } from '../../schema'
import { eq } from 'drizzle-orm'

export async function updateIntegrationConfiguration(
  {
    integration,
    configuration,
  }: {
    integration: IntegrationDto
    configuration: PipedreamIntegrationConfiguration
  },
  transaction = new Transaction(),
): PromisedResult<IntegrationDto> {
  if (integration.type !== IntegrationType.Pipedream) {
    // Currently only Pipedream integrations can be updated, to connect an account
    return Result.error(
      new BadRequestError('Cannot update configuration for this integration'),
    )
  }

  if (isIntegrationConfigured(integration)) {
    return Result.error(
      new BadRequestError('Integration is already configured'),
    )
  }

  if (configuration.appName !== integration.configuration.appName) {
    return Result.error(
      new BadRequestError(
        'Configured account does not match the integration app',
      ),
    )
  }

  return transaction.call(async (tx) => {
    const [result] = await tx
      .update(integrations)
      .set({
        configuration,
      })
      .where(eq(integrations.id, integration.id))
      .returning()

    if (!result) {
      return Result.error(new NotFoundError('Integration not found'))
    }

    return Result.ok(result as IntegrationDto)
  })
}
