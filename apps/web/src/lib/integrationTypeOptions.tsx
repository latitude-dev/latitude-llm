import {
  ActiveIntegrationType,
  IntegrationType,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'

export type IntegrationIcon =
  | { type: 'icon'; name: IconName }
  | { type: 'image'; src: string; alt: string }

export type IntegrationTypeOption = {
  label: string
  icon: IntegrationIcon
}

export const INTEGRATION_TYPE_VALUES: Record<
  ActiveIntegrationType,
  IntegrationTypeOption
> = {
  [IntegrationType.ExternalMCP]: {
    label: 'Custom MCP Server',
    icon: { type: 'icon', name: 'mcp' },
  },
  [IntegrationType.Latitude]: {
    label: 'Latitude Built-in tools',
    icon: { type: 'icon', name: 'logoMonochrome' },
  },
  [IntegrationType.Pipedream]: {
    label: 'Pipedream',
    icon: { type: 'icon', name: 'unplug' },
  },
}

export function integrationOptions(
  integration: IntegrationDto,
): IntegrationTypeOption {
  if (integration.type === IntegrationType.Pipedream) {
    const imageUrl = integration.configuration.metadata?.imageUrl
    const label =
      integration.configuration.metadata?.displayName ??
      integration.configuration.appName

    return {
      label,
      icon: imageUrl
        ? { type: 'image' as const, src: imageUrl, alt: label }
        : { type: 'icon' as const, name: 'unplug' },
    }
  }

  // @ts-expect-error HostedMCP is not supported as type but we validate on runtime
  if (integration.type === IntegrationType.HostedMCP) {
    throw new Error('HostedMCP integration type is not supported here')
  }

  return INTEGRATION_TYPE_VALUES[integration.type]
}
