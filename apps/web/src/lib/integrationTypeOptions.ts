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
    label: 'Custom MCP Server',
    icon: 'mcp',
  },
  [IntegrationType.HostedMCP]: {
    label: 'MCP Server hosted by Latitude',
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
  [HostedIntegrationType.Github]: {
    label: 'GitHub',
    icon: 'github',
  },
  [HostedIntegrationType.Notion]: {
    label: 'Notion',
    icon: 'notion',
  },
  [HostedIntegrationType.Twitter]: {
    label: 'X (Twitter)',
    icon: 'twitterX',
  },
  [HostedIntegrationType.Airtable]: {
    label: 'Airtable',
    icon: 'airtable',
  },
  [HostedIntegrationType.Linear]: {
    label: 'Linear',
    icon: 'linear',
  },
  [HostedIntegrationType.YoutubeCaptions]: {
    label: 'YouTube Captions',
    icon: 'youtube',
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
