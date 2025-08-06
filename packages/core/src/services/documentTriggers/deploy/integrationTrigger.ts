import { IntegrationType, DocumentTriggerType } from '@latitude-data/constants'
import { Commit, Workspace, DocumentTrigger } from '../../../browser'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import {
  deployPipedreamTrigger,
  destroyPipedreamTrigger,
} from '../../integrations/pipedream/triggers'
import { IntegrationsRepository } from '../../../repositories'

import {
  IntegrationTriggerConfiguration,
  IntegrationTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'

/**
 * Important Note:
 * This service fetches data from an external service.
 * Do not include this service inside a transaction.
 */
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
  const integrationResult = await transaction.call(async (tx) => {
    const integrationsScope = new IntegrationsRepository(workspace.id, tx)
    return integrationsScope.find(configuration.integrationId)
  })
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

  if (!Result.isOk(deploymentResult)) return deploymentResult
  const { id: triggerId } = deploymentResult.unwrap()

  return Result.ok({
    triggerId,
  })
}

/**
 * Important Note:
 * This service fetches data from an external service.
 * Do not include this service inside a transaction.
 */
export async function undeployIntegrationTrigger(
  {
    workspace,
    documentTrigger,
  }: {
    workspace: Workspace
    documentTrigger: DocumentTrigger<DocumentTriggerType.Integration>
  },
  transaction = new Transaction(),
): PromisedResult<undefined> {
  const integrationResult = await transaction.call(async (tx) => {
    const integrationsScope = new IntegrationsRepository(workspace.id, tx)
    return integrationsScope.find(documentTrigger.configuration.integrationId)
  })
  if (!Result.isOk(integrationResult)) return integrationResult
  const integration = integrationResult.unwrap()

  if (integration.type !== IntegrationType.Pipedream) {
    // No need to undeploy non-pipedream triggers
    return Result.nil()
  }

  const destroyResult = await destroyPipedreamTrigger(
    {
      workspace,
      documentTrigger,
    },
    transaction,
  )

  if (!Result.isOk(destroyResult)) return destroyResult
  return Result.ok(undefined)
}
