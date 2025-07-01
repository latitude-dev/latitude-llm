import {
  ComponentId,
  ConfigurableProps,
  ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk'
import { gatewayPath, PipedreamIntegration } from '../../../browser'
import { getPipedreamEnvironment } from './apps'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { fillConfiguredProps } from './components'

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
