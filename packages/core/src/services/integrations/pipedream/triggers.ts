import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentTrigger } from '../../../schema/models/types/DocumentTrigger'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { PipedreamIntegration } from '../../../schema/models/types/Integration'
import { gatewayPath } from '../../../helpers'
import { getPipedreamClient } from './apps'
import { Result } from '../../../lib/Result'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import {
  fillConfiguredProps,
  isIntegrationConfigured,
} from './components/fillConfiguredProps'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import { findIntegrationById } from '../../../queries/integrations/findById'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'

export async function deployPipedreamTrigger({
  triggerUuid,
  commit,
  integration,
  componentId,
  configuredProps: configuredClientProps,
}: {
  triggerUuid: string
  commit: Commit
  integration: PipedreamIntegration
  componentId: string
  configuredProps: ConfiguredProps<ConfigurableProps>
}): PromisedResult<{ id: string }> {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new BadRequestError(
        `Integration '${integration.name}' has not been configured.`,
      ),
    )
  }

  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

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
    // Need the dynamic props id for some components to work correctly (i.e. Github new branch trigger)
    const reload = await pipedream.components.reloadProps({
      id: componentId,
      externalUserId: integration.configuration.externalUserId,
      configuredProps,
    })

    const deployResult = await pipedream.triggers.deploy({
      id: componentId,
      externalUserId,
      configuredProps,
      dynamicPropsId: reload.dynamicProps?.id,
      webhookUrl: gatewayPath(
        `/webhook/integration/${triggerUuid}/${commit.uuid}`,
      ),
    })

    return Result.ok({ id: deployResult.data.id })
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function destroyPipedreamTrigger(
  {
    workspace,
    documentTrigger,
  }: {
    workspace: Workspace
    documentTrigger: DocumentTrigger<DocumentTriggerType.Integration>
  },
  transaction = new Transaction(),
): PromisedResult<undefined> {
  if (!documentTrigger.deploymentSettings) {
    return Result.nil() // Not need to undeploy if not deployed
  }

  const integrationResult = await transaction.call(async (tx) => {
    try {
      const found = await findIntegrationById(
        { workspaceId: workspace.id, id: documentTrigger.configuration.integrationId },
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

  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  try {
    await pipedream.deployedTriggers.delete(
      documentTrigger.deploymentSettings.triggerId,
      {
        externalUserId: integration.configuration.externalUserId,
      },
    )
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
