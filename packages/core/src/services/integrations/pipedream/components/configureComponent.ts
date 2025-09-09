import {
  ComponentId,
  ConfigurableProps,
  ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk/server'
import { IntegrationDto } from '../../../../browser'
import { IntegrationType } from '@latitude-data/constants'
import { Result } from '../../../../lib/Result'
import { NotFoundError } from '@latitude-data/constants/errors'
import { getPipedreamEnvironment } from '../apps'
import { isIntegrationConfigured } from './reloadComponentProps'
import { fillConfiguredProps } from './fillConfiguredProps'

export async function configureComponent({
  integration,
  componentId,
  propName,
  configuredProps: configuredClientProps,
}: {
  integration: Extract<IntegrationDto, { type: IntegrationType.Pipedream }>
  componentId: string | ComponentId
  propName: string
  configuredProps?: ConfiguredProps<ConfigurableProps>
}) {
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
    // TODO - Add pagination possibilities, then start using prevContext, query, and page
    const response = await pipedream.configureComponent({
      externalUserId,
      userId: externalUserId,
      componentId,
      propName,
      configuredProps: configuredPropsResult.unwrap(),
    })

    return Result.ok(response)
  } catch (error) {
    return Result.error(error as Error)
  }
}
