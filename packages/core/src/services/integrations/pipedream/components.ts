import {
  ComponentId,
  ConfigurableProp,
  ConfigurablePropApp,
  ConfigurableProps,
  ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk/server'
import { Result } from '../../../lib/Result'
import { getPipedreamEnvironment } from './apps'
import { IntegrationType } from '@latitude-data/constants'
import { IntegrationDto } from '../../../browser'
import { BadRequestError } from '@latitude-data/constants/errors'
import { PromisedResult } from '../../../lib/Transaction'

type PipedreamIntegration = Extract<
  IntegrationDto,
  { type: IntegrationType.Pipedream }
>

export async function reloadComponentProps({
  integration,
  componentId,
  configuredProps,
}: {
  integration: PipedreamIntegration
  componentId: string | ComponentId
  configuredProps: ConfiguredProps<ConfigurableProps>
}) {
  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())
  const externalUserId = integration.configuration.externalUserId

  try {
    const response = await pipedream.reloadComponentProps({
      externalUserId,
      userId: externalUserId,
      componentId,
      configuredProps,
    })

    return Result.ok(response)
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function fillConfiguredProps({
  integration,
  componentId,
  configuredProps,
}: {
  integration: PipedreamIntegration
  componentId: ComponentId | string
  configuredProps: ConfiguredProps<ConfigurableProps>
}): PromisedResult<ConfiguredProps<ConfigurableProps>> {
  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    const { data: component } = await pipedream.getComponent(
      typeof componentId === 'string' ? { key: componentId } : componentId,
    )

    // "app" props are only configured in the backend
    const appProps: ConfigurablePropApp[] = component.configurable_props.filter(
      (prop: ConfigurableProp) => prop.type === 'app',
    )

    if (
      appProps.some((prop) => prop.app !== integration.configuration.appName)
    ) {
      return Result.error(
        new BadRequestError(
          'Component is not configurable for this integration.',
        ),
      )
    }

    const configuredAppProps = Object.fromEntries(
      appProps.map((prop) => [
        prop.name,
        {
          authProvisionId: integration.configuration.connectionId,
        },
      ]),
    )

    return Result.ok({
      ...configuredProps,
      ...configuredAppProps,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}

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
