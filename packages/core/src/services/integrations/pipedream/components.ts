import {
  BackendClient,
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
import { IntegrationDto, PipedreamIntegration } from '../../../browser'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { PromisedResult } from '../../../lib/Transaction'
import { env } from '@latitude-data/env'
import { PipedreamIntegrationConfiguration } from '../helpers/schema'

export function isIntegrationConfigured<T extends PipedreamIntegration>(
  integration: T,
): integration is T & { configuration: PipedreamIntegrationConfiguration } {
  return 'connectionId' in integration.configuration
}

export async function reloadComponentProps({
  integration,
  componentId,
  configuredProps,
}: {
  integration: PipedreamIntegration
  componentId: string | ComponentId
  configuredProps: ConfiguredProps<ConfigurableProps>
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

function addDefaultPropValue({
  configurableProps,
  configuredProps,
  propName,
  defaultValues,
}: {
  configurableProps: ConfigurableProps
  configuredProps: ConfiguredProps<ConfigurableProps>
  propName: string
  defaultValues: Record<string, unknown>
}) {
  if (!configurableProps.some((prop) => prop.name === propName)) {
    // The prop is not configurable
    return
  }

  if (propName in configuredProps) {
    // The prop is already configured
    return
  }

  Object.entries(defaultValues).forEach(([key, value]) => {
    configuredProps[key] = value
  })
}

export async function fillConfiguredProps({
  pipedream,
  integration,
  componentId,
  configuredProps,
}: {
  pipedream: BackendClient
  integration: PipedreamIntegration
  componentId: ComponentId | string
  configuredProps: ConfiguredProps<ConfigurableProps>
}): PromisedResult<ConfiguredProps<ConfigurableProps>> {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new NotFoundError(
        `Integration '${integration.name}' has not been configured.`,
      ),
    )
  }

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

    // We include some hardcodded props by default when not provided by the user
    addDefaultPropValue({
      configurableProps: component.configurable_props,
      configuredProps,
      propName: 'customizeBotSettings',
      defaultValues: {
        customizeBotSettings: true,
        username: env.SLACK_DEFAULT_BOT_NAME,
        icon_url: env.SLACK_DEFAULT_BOT_ICON_URL,
      },
    })
    addDefaultPropValue({
      configurableProps: component.configurable_props,
      configuredProps,
      propName: 'includeSentViaPipedream',
      defaultValues: { includeSentViaPipedream: false },
    })
    addDefaultPropValue({
      configurableProps: component.configurable_props,
      configuredProps,
      propName: 'include_sent_via_pipedream_flag',
      defaultValues: { include_sent_via_pipedream_flag: false },
    })

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

export async function runAction({
  integration,
  toolName,
  args,
}: {
  integration: PipedreamIntegration
  toolName: string
  args: Record<string, unknown>
}): PromisedResult<unknown, Error> {
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
  const configuredPropsResult = await fillConfiguredProps({
    pipedream,
    integration,
    componentId: toolName,
    configuredProps: args,
  })

  if (!Result.isOk(configuredPropsResult)) {
    return Result.error(configuredPropsResult.error)
  }

  // We need to do this to obtain the dynamicPropsId. I do not know why, ask Pipedream.
  const reload = await pipedream.reloadComponentProps({
    externalUserId: integration.configuration.externalUserId,
    componentId: toolName,
    configuredProps: configuredPropsResult.unwrap(),
  })

  const result = await pipedream.runAction({
    externalUserId: integration.configuration.externalUserId,
    actionId: toolName,
    configuredProps: configuredPropsResult.unwrap(),
    dynamicPropsId: reload.dynamicProps?.id,
  })

  if (result.os.length > 0) {
    const output = result.os[0]! as {
      ts?: number
      k?: 'error'
      err?: { name: string; message: string; stack: string }
    }

    if (output.k === 'error' && output.err) {
      return Result.error(new Error(output.err.message))
    }
  }

  if (result.ret !== undefined && result.ret !== null) {
    return Result.ok(result.ret)
  }

  return Result.ok({ ok: true }) // Default response if no return value is provided
}
