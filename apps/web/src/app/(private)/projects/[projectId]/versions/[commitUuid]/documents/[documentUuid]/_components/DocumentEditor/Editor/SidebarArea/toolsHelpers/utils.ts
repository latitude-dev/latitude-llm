import { INTEGRATION_TYPE_VALUES } from '$/lib/integrationTypeOptions'
import { IntegrationType } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

export function getIntegrationData({
  name,
  integrations,
}: {
  name: string
  integrations: IntegrationDto[]
}) {
  const integration = integrations.find((i) => i.name === name)
  if (!integration) return undefined

  const commonData = {
    id: integration.id,
    type: integration.type,
    name,
    configuration: integration.configuration,
  }

  if (integration.type === IntegrationType.Pipedream) {
    const imageUrl = integration.configuration.metadata?.imageUrl ?? 'unplug'
    const label =
      integration.configuration.metadata?.displayName ??
      integration.configuration.appName
    return {
      ...commonData,
      icon: {
        type: 'image' as const,
        src: imageUrl,
        alt: label,
      },
    }
  }

  if (integration.type === IntegrationType.Latitude) {
    return {
      ...commonData,
      icon: {
        type: 'icon' as const,
        name: 'logo' as IconName,
      },
    }
  }

  const { icon } = INTEGRATION_TYPE_VALUES[integration.type]
  return {
    ...commonData,
    icon: {
      type: 'icon' as const,
      name: icon as IconName,
    },
  }
}

export function normalizeIntegrations(
  tools: LatitudePromptConfig['tools'],
): (string | Record<string, unknown>)[] {
  if (!tools) return []
  if (Array.isArray(tools)) return tools

  return Object.entries(tools).map(([toolName, toolDefinition]) => ({
    [toolName]: toolDefinition,
  }))
}
