import {
  PipedreamClient,
  ConfigurablePropApp,
  ConfigurableProps,
  ConfiguredProps,
} from '@pipedream/sdk/server'
import { Result } from '../../../../lib/Result'
import { PipedreamIntegration } from '../../../../browser'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { PromisedResult } from '../../../../lib/Transaction'
import { env } from '@latitude-data/env'
import { PipedreamIntegrationConfiguration } from '../../helpers/schema'

export function isIntegrationConfigured<T extends PipedreamIntegration>(
  integration: T,
): integration is T & { configuration: PipedreamIntegrationConfiguration } {
  return 'connectionId' in integration.configuration
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
  pipedream: PipedreamClient
  integration: PipedreamIntegration
  componentId: string
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
    const { data: component } = await pipedream.components.retrieve(componentId)

    // "app" props are only configured in the backend
    const appProps = component.configurableProps.filter(
      (prop) => prop.type === 'app',
    ) as ConfigurablePropApp[]

    if (
      appProps.some((prop) => prop.app !== integration.configuration.appName)
    ) {
      return Result.ok(configuredProps)
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
      configurableProps: component.configurableProps,
      configuredProps,
      propName: 'customizeBotSettings',
      defaultValues: {
        customizeBotSettings: true,
        username: env.SLACK_DEFAULT_BOT_NAME,
        icon_url: env.SLACK_DEFAULT_BOT_ICON_URL,
      },
    })
    addDefaultPropValue({
      configurableProps: component.configurableProps,
      configuredProps,
      propName: 'includeSentViaPipedream',
      defaultValues: { includeSentViaPipedream: false },
    })
    addDefaultPropValue({
      configurableProps: component.configurableProps,
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
