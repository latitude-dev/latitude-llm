import {
  ComponentId,
  ConfigurableProps,
  ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk'
import {
  DocumentTrigger,
  gatewayPath,
  PipedreamIntegration,
  Workspace,
} from '../../../browser'
import { getPipedreamEnvironment } from './apps'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { fillConfiguredProps, isIntegrationConfigured } from './components'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import { database } from '../../../client'
import { IntegrationsRepository } from '../../../repositories'
import {
  InsertIntegrationTriggerConfiguration,
  IntegrationTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { isEqual } from 'lodash-es'

export async function deployPipedreamTrigger({
  triggerUuid,
  integration,
  componentId,
  configuredProps: configuredClientProps,
}: {
  triggerUuid: string
  integration: PipedreamIntegration
  componentId: ComponentId
  configuredProps: ConfiguredProps<ConfigurableProps>
}): PromisedResult<{ id: string }> {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new BadRequestError(
        `Integration '${integration.name}' has not been configured.`,
      ),
    )
  }

  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())
  const externalUserId = integration.configuration.externalUserId

  const configuredPropsResult = await fillConfiguredProps({
    pipedream,
    integration,
    componentId,
    configuredProps: configuredClientProps ?? {},
  })
  if (!Result.isOk(configuredPropsResult)) {
    return Result.error(configuredPropsResult.error)
  }
  const configuredProps = configuredPropsResult.unwrap()

  try {
    const deployResult = await pipedream.deployTrigger({
      externalUserId,
      triggerId: componentId,
      configuredProps,
      webhookUrl: gatewayPath(`/webhook/integration/${triggerUuid}`),
    })

    return Result.ok({ id: deployResult.data.id })
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function updatePipedreamTrigger(
  {
    workspace,
    trigger,
    updatedConfig,
  }: {
    workspace: Workspace
    trigger: Extract<
      DocumentTrigger,
      { triggerType: DocumentTriggerType.Integration }
    >
    updatedConfig: InsertIntegrationTriggerConfiguration
  },
  db = database,
): PromisedResult<IntegrationTriggerConfiguration, Error> {
  const originalConfig = trigger.configuration

  if (
    originalConfig.integrationId === updatedConfig.integrationId &&
    originalConfig.componentId === updatedConfig.componentId &&
    isEqual(originalConfig.properties, updatedConfig.properties)
  ) {
    return Result.ok({
      ...updatedConfig,
      triggerId: originalConfig.triggerId,
    })
  }

  const integrationsScope = new IntegrationsRepository(workspace.id, db)

  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  if (
    originalConfig.integrationId === updatedConfig.integrationId &&
    originalConfig.componentId === updatedConfig.componentId
  ) {
    // Same trigger, just update properties
    const integrationResult = await integrationsScope.find(
      originalConfig.integrationId,
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

    if (!isIntegrationConfigured(integration)) {
      return Result.error(
        new NotFoundError(
          `Integration '${integration.name}' has not been configured.`,
        ),
      )
    }

    const newConfigPropsResult = await fillConfiguredProps({
      pipedream,
      integration,
      componentId: originalConfig.componentId,
      configuredProps: updatedConfig.properties ?? {},
    })
    if (!Result.isOk(newConfigPropsResult)) return newConfigPropsResult
    const newConfiguredProps = newConfigPropsResult.unwrap()

    try {
      await pipedream.updateTrigger({
        id: originalConfig.triggerId,
        externalUserId: integration.configuration.externalUserId,
        configuredProps: newConfiguredProps,
      })

      return Result.ok({
        ...updatedConfig,
        triggerId: originalConfig.triggerId,
      })
    } catch (error) {
      return Result.error(error as Error)
    }
  }

  // Different trigger, must destroy and deploy again
  const oldIntegrationResult = await integrationsScope.find(
    originalConfig.integrationId,
  )
  if (!Result.isOk(oldIntegrationResult)) return oldIntegrationResult
  const oldIntegration = oldIntegrationResult.unwrap()

  const newIntegrationResult = await integrationsScope.find(
    updatedConfig.integrationId,
  )
  if (!Result.isOk(newIntegrationResult)) return newIntegrationResult
  const newIntegration = newIntegrationResult.unwrap()

  if (oldIntegration.type !== IntegrationType.Pipedream) {
    return Result.error(
      new BadRequestError(
        `Integration type '${oldIntegration.type}' is not supported for document triggers`,
      ),
    )
  }
  if (!isIntegrationConfigured(oldIntegration)) {
    return Result.error(
      new NotFoundError(
        `Integration '${oldIntegration.name}' has not been configured.`,
      ),
    )
  }
  if (newIntegration.type !== IntegrationType.Pipedream) {
    return Result.error(
      new BadRequestError(
        `Integration type '${newIntegration.type}' is not supported for document triggers`,
      ),
    )
  }
  if (!isIntegrationConfigured(newIntegration)) {
    return Result.error(
      new NotFoundError(
        `Integration '${newIntegration.name}' has not been configured.`,
      ),
    )
  }

  try {
    await pipedream.deleteTrigger({
      id: originalConfig.triggerId,
      externalUserId: oldIntegration.configuration.externalUserId,
    })
  } catch (error) {
    return Result.error(error as Error)
  }

  const deployResult = await deployPipedreamTrigger({
    triggerUuid: trigger.uuid,
    integration: newIntegration,
    componentId: { key: updatedConfig.componentId },
    configuredProps: updatedConfig.properties ?? {},
  })

  if (!Result.isOk(deployResult)) return deployResult
  const deployedTrigger = deployResult.unwrap()

  return Result.ok({
    ...updatedConfig,
    triggerId: deployedTrigger.id,
  }) // Updated config with new deployed trigger
}

export async function destroyPipedreamTrigger(
  {
    workspace,
    documentTrigger,
  }: {
    workspace: Workspace
    documentTrigger: Extract<
      DocumentTrigger,
      { triggerType: DocumentTriggerType.Integration }
    >
  },
  db = database,
): PromisedResult<undefined> {
  const integrationsScope = new IntegrationsRepository(workspace.id, db)
  const integrationResult = await integrationsScope.find(
    documentTrigger.configuration.integrationId,
  )
  if (!Result.isOk(integrationResult)) {
    return Result.error(integrationResult.error)
  }
  const integration = integrationResult.unwrap()

  if (integration.type !== IntegrationType.Pipedream) {
    return Result.error(
      new Error(
        `Integration type '${integration.type}' is not supported for document triggers`,
      ),
    )
  }
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new NotFoundError(
        `Integration '${integration.name}' has not been configured.`,
      ),
    )
  }

  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    await pipedream.deleteTrigger({
      id: documentTrigger.configuration.triggerId,
      externalUserId: integration.configuration.externalUserId,
    })
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
