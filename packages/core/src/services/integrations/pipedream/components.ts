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

export async function configureComponent({
  integration,
  componentId,
  propName,
  configuredProps,
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

  try {
    const { data: component } = await pipedream.getComponent(
      typeof componentId === 'string' ? { key: componentId } : componentId,
    )

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

    const response = await pipedream.configureComponent({
      externalUserId,
      userId: externalUserId,
      componentId,
      propName,
      configuredProps: {
        ...(configuredProps ?? {}),
        ...configuredAppProps,
      },
      prevContext: previousContext,
      query,
      page,
    })

    return Result.ok(response)
  } catch (error) {
    return Result.error(error as Error)
  }
}
