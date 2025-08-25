import {
  type BackendClient,
  type ComponentId,
  type ConfigurableProps,
  type ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk/server'
import type { PipedreamIntegration } from '../../../../browser'
import type { PipedreamIntegrationConfiguration } from '../../helpers/schema'
import { Result } from '../../../../lib/Result'
import { NotFoundError } from '@latitude-data/constants/errors'
import { getPipedreamEnvironment } from '../apps'
import { fillConfiguredProps } from './fillConfiguredProps'

export function isIntegrationConfigured<T extends PipedreamIntegration>(
  integration: T,
): integration is T & { configuration: PipedreamIntegrationConfiguration } {
  return 'connectionId' in integration.configuration
}

export async function reloadComponentProps({
  integration,
  componentId,
  configuredProps: configuredClientProps,
  pipedream,
}: {
  integration: PipedreamIntegration
  componentId: string | ComponentId
  configuredProps: ConfiguredProps<ConfigurableProps>
  pipedream?: BackendClient
}) {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new NotFoundError(`Integration '${integration.name}' has not been configured.`),
    )
  }

  if (!pipedream) {
    const pipedreamEnv = getPipedreamEnvironment()
    if (!pipedreamEnv.ok) {
      return Result.error(pipedreamEnv.error!)
    }

    pipedream = createBackendClient(pipedreamEnv.unwrap())
  }

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

  try {
    const response = await pipedream.reloadComponentProps({
      externalUserId,
      userId: externalUserId,
      componentId,
      configuredProps: configuredPropsResult.unwrap(),
    })

    return Result.ok(response)
  } catch (error) {
    return Result.error(error as Error)
  }
}
