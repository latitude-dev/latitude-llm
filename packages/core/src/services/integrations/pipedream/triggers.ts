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
import { fillConfiguredProps } from './components'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import { database } from '../../../client'
import { IntegrationsRepository } from '../../../repositories'

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
