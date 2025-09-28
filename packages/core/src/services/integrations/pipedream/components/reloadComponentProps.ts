import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/server'
import { PipedreamIntegration } from '../../../../schema/types'
import { PipedreamIntegrationConfiguration } from '../../helpers/schema'
import { Result } from '../../../../lib/Result'
import { NotFoundError } from '@latitude-data/constants/errors'
import { getPipedreamClient } from '../apps'
import { fillConfiguredProps } from './fillConfiguredProps'
import { PipedreamClient } from '@pipedream/sdk'

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
  componentId: string
  configuredProps: ConfiguredProps<ConfigurableProps>
  pipedream?: PipedreamClient
}) {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new NotFoundError(
        `Integration '${integration.name}' has not been configured.`,
      ),
    )
  }

  if (!pipedream) {
    const pipedreamResult = getPipedreamClient()
    if (!Result.isOk(pipedreamResult)) return pipedreamResult
    pipedream = pipedreamResult.unwrap()
  }

  const externalUserId = integration.configuration.externalUserId

  const configuredPropsResult = await fillConfiguredProps({
    pipedream,
    integration,
    componentId,
    configuredProps: configuredClientProps ?? {},
  })
  if (!Result.isOk(configuredPropsResult)) return configuredPropsResult
  const configuredProps = configuredPropsResult.unwrap()

  try {
    const response = await pipedream.components.reloadProps({
      id: componentId,
      externalUserId,
      configuredProps,
    })

    return Result.ok(response)
  } catch (error) {
    return Result.error(error as Error)
  }
}
