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
  [HostedIntegrationType.Reddit]: {
    label: 'Reddit',
    icon: 'reddit',
  },
  [HostedIntegrationType.Telegram]: {
    label: 'Telegram',
    icon: 'telegram',
  },
  [HostedIntegrationType.Tinybird]: {
    label: 'Tinybird',
    icon: 'tinybird',
  },
  [HostedIntegrationType.Perplexity]: {
    label: 'Perplexity',
    icon: 'perplexity',
  },
  [HostedIntegrationType.AwsKbRetrieval]: {
    label: 'AWS Knowledge Base Retrieval',
    icon: 'awsBedrock',
  },
  [HostedIntegrationType.BraveSearch]: {
    label: 'Brave Search',
    icon: 'brave',
  },
  [HostedIntegrationType.EverArt]: {
    label: 'EverArt',
    icon: 'mcp',
  },
  [HostedIntegrationType.Fetch]: {
    label: 'Fetch',
    icon: 'globe',
  },
  [HostedIntegrationType.GitLab]: {
    label: 'GitLab',
    icon: 'gitlab',
  },
  [HostedIntegrationType.GoogleMaps]: {
    label: 'Google Maps',
    icon: 'mapPin',
  },
  [HostedIntegrationType.Sentry]: {
    label: 'Sentry',
    icon: 'sentry',
  },
  [HostedIntegrationType.Puppeteer]: {
    label: 'Puppeteer',
    icon: 'appWindow',
  },
  [HostedIntegrationType.Time]: {
    label: 'Time',
    icon: 'clock',
  },
  [HostedIntegrationType.browserbase]: {
    label: 'browserbase',
    icon: 'browserbase',
  },
  [HostedIntegrationType.Neon]: {
    label: 'Neon',
    icon: 'neon',
  },
  [HostedIntegrationType.Postgres]: {
    label: 'PostgreSQL',
    icon: 'postgres',
  },
  [HostedIntegrationType.Redis]: {
    label: 'Redis',
    icon: 'redis',
  },
  [HostedIntegrationType.Jira]: {
    label: 'Jira',
    icon: 'jira',
  },
  [HostedIntegrationType.Attio]: {
    label: 'Attio',
    icon: 'attio',
  },
  [HostedIntegrationType.Ghost]: {
    label: 'Ghost',
    icon: 'ghost',
  },
  [HostedIntegrationType.Supabase]: {
    label: 'Supabase',
    icon: 'supabase',
  },
  [HostedIntegrationType.Figma]: {
    label: 'Figma',
    icon: 'figma',
  },
  [HostedIntegrationType.Hyperbrowser]: {
    label: 'Hyperbrowser',
    icon: 'hyperbrowser',
  },
}

export function integrationOptions(
  integration: IntegrationDto,
): IntegrationTypeOption {
  if (
    integration.type === IntegrationType.HostedMCP &&
    Object.keys(HOSTED_INTEGRATION_TYPE_OPTIONS).includes(
      integration.configuration.type,
    )
  ) {
    return HOSTED_INTEGRATION_TYPE_OPTIONS[integration.configuration.type]
  }

  return INTEGRATION_TYPE_VALUES[integration.type]
}
