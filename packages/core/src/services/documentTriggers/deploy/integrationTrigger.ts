import { IntegrationType } from '@latitude-data/constants'
import { Commit, Workspace } from '../../../browser'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import { deployPipedreamTrigger } from '../../integrations/pipedream/triggers'
import { IntegrationsRepository } from '../../../repositories'

import {
  IntegrationTriggerConfiguration,
  IntegrationTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'

export async function deployIntegrationTrigger(
  {
    workspace,
    triggerUuid,
    commit,
    configuration,
  }: {
    workspace: Workspace
    triggerUuid: string
    commit: Commit
    configuration: IntegrationTriggerConfiguration
  },
  transaction = new Transaction(),
): PromisedResult<IntegrationTriggerDeploymentSettings> {
  return transaction.call(async (tx) => {
    const integrationsScope = new IntegrationsRepository(workspace.id, tx)
    const integrationResult = await integrationsScope.find(
      configuration.integrationId,
    )
    if (!Result.isOk(integrationResult)) return integrationResult
    const integration = integrationResult.unwrap()

    if (integration.type !== IntegrationType.Pipedream) {
      return Result.error(
        new BadRequestError(
          `Integration type '${integration.type}' is not supported for document triggers`,
        ),
      )
    }

    const deploymentResult = await deployPipedreamTrigger({
      triggerUuid,
      commit,
      integration,
      componentId: { key: configuration.componentId },
      configuredProps: configuration.properties ?? {},
    })

    if (!Result.isOk(deploymentResult)) {
      return Result.error(deploymentResult.error)
    }

    const { id: triggerId } = deploymentResult.unwrap()
    return Result.ok({
      triggerId,
    })
  })
}
