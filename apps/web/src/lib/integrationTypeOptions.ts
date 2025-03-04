import {
  HostedIntegrationType,
  IntegrationType,
} from '@latitude-data/constants'
import { IntegrationDto } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui'

export type IntegrationTypeOption = {
  label: string
  icon: IconName
}

export const INTEGRATION_TYPE_VALUES: Record<
  IntegrationType,
  IntegrationTypeOption
> = {
  [IntegrationType.ExternalMCP]: {
    label: 'External MCP Server',
    icon: 'mcp',
  },
  [IntegrationType.HostedMCP]: {
    label: 'Custom MCP Server hosted by Latitude',
    icon: 'mcp',
  },
  [IntegrationType.Latitude]: {
    label: 'Latitude Built-in tools',
    icon: 'logoMonochrome',
  },
}

export const HOSTED_INTEGRATION_TYPE_OPTIONS: Record<
  HostedIntegrationType,
  IntegrationTypeOption
> = {
  [HostedIntegrationType.Slack]: {
    label: 'Slack',
    icon: 'slack',
  },
  [HostedIntegrationType.Stripe]: {
    label: 'Stripe',
    icon: 'stripe',
  },
}

export function integrationOptions(
  integration: IntegrationDto,
): IntegrationTypeOption {
  if (
    integration.type === IntegrationType.HostedMCP &&
    integration.configuration.type
  ) {
    return HOSTED_INTEGRATION_TYPE_OPTIONS[integration.configuration.type]
  }

  return INTEGRATION_TYPE_VALUES[integration.type]
}
