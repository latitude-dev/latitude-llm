import {
  BackendClient,
  ConfigurableProp,
  ConfiguredProps,
} from '@pipedream/sdk'
import {
  ConfigurablePropWithRemoteOptions,
  PipedreamIntegration,
  RemoteOptions,
} from '../../../../../browser'
import { Result } from '../../../../../lib/Result'
import { LatitudeError } from '@latitude-data/constants/errors'
import {
  fillConfiguredProps,
  isIntegrationConfigured,
} from '../../../../integrations/pipedream/components/fillConfiguredProps'
import { PromisedResult } from '../../../../../lib/Transaction'

const DYNAMIC_PROP_PREFIXES = ['$.discord.', '$.airtable.'] as const

export const IRRELEVANT_PROP_TYPES = [
  'app',
  '$.service.db',
  '$.service.http',
  '$.interface.apphook',
  '$.interface.http',
  '$.interface.db',
]

export async function fetchFullConfigSchema({
  pipedream,
  componentId,
  integration,
}: {
  pipedream: BackendClient
  componentId: string
  integration: PipedreamIntegration
}): PromisedResult<ConfigurablePropWithRemoteOptions[]> {
  try {
    const { data: component } = await pipedream.getComponent(
      typeof componentId === 'string' ? { key: componentId } : componentId,
    )

    const relevantLatteProps = (
      component.configurable_props as ConfigurableProp[]
    ).filter((prop) => !IRRELEVANT_PROP_TYPES.includes(prop.type))

    if (!isIntegrationConfigured(integration)) {
      // We still want to return the initial schema to Latte if integration is not configured, so it can fill what it can
      return Result.ok(relevantLatteProps)
    }

    const externalUserId = integration.configuration.externalUserId

    const relevantLattePropsWithOptions = await addRemoteOptions(
      componentId,
      pipedream,
      relevantLatteProps,
      integration,
      externalUserId,
    )

    if (!Result.isOk(relevantLattePropsWithOptions)) {
      return Result.error(relevantLattePropsWithOptions.error)
    }

    return Result.ok(relevantLattePropsWithOptions.value)
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function addRemoteOptions(
  componentId: string,
  pipedream: BackendClient,
  filteredProps: ConfigurableProp[],
  integration: PipedreamIntegration,
  externalUserId: string,
): PromisedResult<ConfigurablePropWithRemoteOptions[]> {
  const configuredComponentsResult = await fillConfiguredProps({
    pipedream,
    integration,
    componentId,
    configuredProps: {},
  })

  if (!Result.isOk(configuredComponentsResult)) {
    return Result.error(configuredComponentsResult.error)
  }

  const configuredProps = configuredComponentsResult.unwrap()

  const propsWithOptions = await Promise.all(
    filteredProps.map(async (prop) => {
      if (isDynamicProp(prop)) {
        return fetchRemoteOptions({
          prop,
          pipedream,
          externalUserId,
          componentId,
          propName: prop.name,
          configuredProps,
        })
      }
      // If the prop is not dynamic, we return it as is
      return prop as ConfigurablePropWithRemoteOptions
    }),
  )

  return Result.ok(propsWithOptions)
}

async function fetchRemoteOptions({
  prop,
  pipedream,
  externalUserId,
  componentId,
  propName,
  configuredProps,
}: {
  prop: ConfigurableProp
  pipedream: BackendClient
  externalUserId: string
  componentId: string
  propName: string
  configuredProps: ConfiguredProps<readonly ConfigurableProp[]>
}): Promise<ConfigurablePropWithRemoteOptions> {
  const remoteOptions = await pipedream.configureComponent({
    externalUserId,
    userId: externalUserId,
    componentId: componentId,
    propName: propName,
    configuredProps: configuredProps,
  })

  if (remoteOptions.errors) {
    throw new LatitudeError(remoteOptions.errors.join(', '))
  }

  return {
    ...prop,
    remoteOptionValues: new RemoteOptions(
      remoteOptions.options ?? remoteOptions.stringOptions ?? [],
    ),
  }
}

function isDynamicProp(prop: ConfigurableProp): boolean {
  if (prop.remoteOptions) return true
  return DYNAMIC_PROP_PREFIXES.some((prefix) => prop.type.startsWith(prefix))
}
