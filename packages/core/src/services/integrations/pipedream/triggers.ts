import {
  type ComponentId,
  type ConfigurableProps,
  type ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk'
import {
  type Commit,
  type DocumentTrigger,
  gatewayPath,
  type PipedreamIntegration,
  type Workspace,
} from '../../../browser'
import { getPipedreamEnvironment } from './apps'
import { Result } from '../../../lib/Result'
import Transaction, { type PromisedResult } from '../../../lib/Transaction'
import { fillConfiguredProps, isIntegrationConfigured } from './components/fillConfiguredProps'
import { type DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import { IntegrationsRepository } from '../../../repositories'
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
  componentId: ComponentId
  configuredProps: ConfiguredProps<ConfigurableProps>
}): PromisedResult<{ id: string }> {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new BadRequestError(`Integration '${integration.name}' has not been configured.`),
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
    // Need the dynamic props id for some components to work correctly (i.e. Github new branch trigger)
    const reload = await pipedream.reloadComponentProps({
      externalUserId: integration.configuration.externalUserId,
      componentId: componentId,
      configuredProps: configuredPropsResult.unwrap(),
    })

    const deployResult = await pipedream.deployTrigger({
      externalUserId,
      triggerId: componentId,
      configuredProps,
      dynamicPropsId: reload.dynamicProps?.id,
      webhookUrl: gatewayPath(`/webhook/integration/${triggerUuid}/${commit.uuid}`),
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
    const integrationsScope = new IntegrationsRepository(workspace.id, tx)
    return integrationsScope.find(documentTrigger.configuration.integrationId)
  })
  if (!Result.isOk(integrationResult)) return integrationResult
  const integration = integrationResult.unwrap()

  if (integration.type !== IntegrationType.Pipedream) {
    return Result.error(
      new Error(`Integration type '${integration.type}' is not supported for document triggers`),
    )
  }
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new NotFoundError(`Integration '${integration.name}' has not been configured.`),
    )
  }

  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    await pipedream.deleteTrigger({
      id: documentTrigger.deploymentSettings.triggerId,
      externalUserId: integration.configuration.externalUserId,
    })
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
