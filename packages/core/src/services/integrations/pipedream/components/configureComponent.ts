import { IntegrationType } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import {
  ComponentId,
  ConfigurableProps,
  ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk/server'
import { IntegrationDto } from '../../../../browser'
import { Result } from '../../../../lib/Result'
import { getPipedreamEnvironment } from '../apps'
import { fillConfiguredProps } from './fillConfiguredProps'
import { isIntegrationConfigured } from './reloadComponentProps'

export async function configureComponent({
  integration,
  componentId,
  propName,
  configuredProps: configuredClientProps,
  previousContext,

  query,
  page,
}: {
  integration: Extract<IntegrationDto, { type: IntegrationType.Pipedream }>
  componentId: string | ComponentId
  propName: string
  configuredProps?: ConfiguredProps<ConfigurableProps>
  previousContext?: Record<string, unknown>

  query?: string
  page?: number
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
    const response = await pipedream.configureComponent({
      externalUserId,
      userId: externalUserId,
      componentId,
      propName,
      configuredProps: configuredPropsResult.unwrap(),
      prevContext: previousContext,
      query,
      page,
    })

    return Result.ok(response)
  } catch (error) {
    return Result.error(error as Error)
  }
}
