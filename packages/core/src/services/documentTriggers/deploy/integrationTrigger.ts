import {
  IntegrationType,
  DocumentTriggerType,
  DocumentTriggerStatus,
} from '@latitude-data/constants'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import { deployPipedreamTrigger } from '../../integrations/pipedream/triggers'
import { findIntegrationById } from '../../../queries/integrations/findById'
import { publisher } from '../../../events/publisher'

import {
  IntegrationTriggerConfiguration,
  IntegrationTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { isIntegrationConfigured } from '../../integrations/pipedream/components/fillConfiguredProps'
import { getComponentsForApp } from '../../integrations/pipedream/components/getComponents'
import { Workspace } from '../../../schema/models/types/Workspace'
import { Commit } from '../../../schema/models/types/Commit'
import { DocumentTrigger } from '../../../schema/models/types/DocumentTrigger'

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
): PromisedResult<{
  deploymentSettings: IntegrationTriggerDeploymentSettings
  triggerStatus: DocumentTriggerStatus
}> {
  const integrationResult = await transaction.call(async (tx) => {
    try {
      const found = await findIntegrationById(
        { workspaceId: workspace.id, id: configuration.integrationId },
        tx,
      )
      return Result.ok(found)
    } catch (e) {
      return Result.error(e as Error)
    }
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

  if (!isIntegrationConfigured(integration)) {
    // At least, check that the trigger is available for the integration's app
    const componentsResult = await getComponentsForApp(
      integration.configuration.appName,
    )
    if (!Result.isOk(componentsResult)) return componentsResult
    const components = componentsResult.unwrap()

    const component = components.triggers.find(
      (component) => component.key === configuration.componentId,
    )

    if (!component) {
      return Result.error(
        new BadRequestError(
          `There is no trigger with id '${configuration.componentId}' for integration '${integration.name}'`,
        ),
      )
    }

    // Integration is not configured, we cannot deploy the trigger
    return Result.ok({
      deploymentSettings: {} as IntegrationTriggerDeploymentSettings,
      triggerStatus: DocumentTriggerStatus.Pending,
    })
  }

  const deploymentResult = await deployPipedreamTrigger({
    triggerUuid,
    commit,
    integration,
    componentId: configuration.componentId,
    configuredProps: configuration.properties ?? {},
  })

  if (!Result.isOk(deploymentResult)) return deploymentResult
  const { id: triggerId } = deploymentResult.unwrap()

  return Result.ok({
    deploymentSettings: {
      triggerId,
    },
    triggerStatus: DocumentTriggerStatus.Deployed,
  })
}

/**
 * Schedules the undeployment of an integration trigger.
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
    try {
      const found = await findIntegrationById(
        {
          workspaceId: workspace.id,
          id: documentTrigger.configuration.integrationId,
        },
        tx,
      )
      return Result.ok(found)
    } catch (e) {
      return Result.error(e as Error)
    }
  })
  if (!Result.isOk(integrationResult)) return integrationResult
  const integration = integrationResult.unwrap()

  if (integration.type !== IntegrationType.Pipedream) {
    // No need to undeploy non-pipedream triggers
    return Result.nil()
  }

  if (!isIntegrationConfigured(integration)) {
    // Integration is not configured, no need to undeploy
    return Result.ok(undefined)
  }

  // Check if the trigger has deployment settings (if not, nothing to undeploy)
  if (!documentTrigger.deploymentSettings) {
    return Result.ok(undefined)
  }

  // Schedule the undeployment to happen asynchronously via the event system
  publisher.publishLater({
    type: 'documentTriggerUndeployRequested',
    data: {
      workspaceId: workspace.id,
      triggerId: documentTrigger.deploymentSettings.triggerId,
      externalUserId: integration.configuration.externalUserId,
    },
  })

  return Result.ok(undefined)
}
