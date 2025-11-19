import {
  HostedIntegrationType,
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
  IntegrationType,
  IntegrationTypeOption
> = {
  [IntegrationType.ExternalMCP]: {
    label: 'Custom MCP Server',
    icon: { type: 'icon', name: 'mcp' },
  },
  [IntegrationType.HostedMCP]: {
    label: 'MCP Server hosted by Latitude',
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

export const HOSTED_INTEGRATION_TYPE_OPTIONS: Record<
  HostedIntegrationType,
  IntegrationTypeOption
> = {
  [HostedIntegrationType.Slack]: {
    label: 'Slack',
    icon: { type: 'icon', name: 'slack' },
  },
  [HostedIntegrationType.Stripe]: {
    label: 'Stripe',
    icon: { type: 'icon', name: 'stripe' },
  },
  [HostedIntegrationType.Github]: {
    label: 'GitHub',
    icon: { type: 'icon', name: 'github' },
  },
  [HostedIntegrationType.Notion]: {
    label: 'Notion',
    icon: { type: 'icon', name: 'notion' },
  },
  [HostedIntegrationType.Twitter]: {
    label: 'X (Twitter)',
    icon: { type: 'icon', name: 'twitterX' },
  },
  [HostedIntegrationType.Airtable]: {
    label: 'Airtable',
    icon: { type: 'icon', name: 'airtable' },
  },
  [HostedIntegrationType.Linear]: {
    label: 'Linear',
    icon: { type: 'icon', name: 'linear' },
  },
  [HostedIntegrationType.YoutubeCaptions]: {
    label: 'YouTube Captions',
    icon: { type: 'icon', name: 'youtube' },
  },
  [HostedIntegrationType.Reddit]: {
    label: 'Reddit',
    icon: { type: 'icon', name: 'reddit' },
  },
  [HostedIntegrationType.Telegram]: {
    label: 'Telegram',
    icon: { type: 'icon', name: 'telegram' },
  },
  [HostedIntegrationType.Tinybird]: {
    label: 'Tinybird',
    icon: { type: 'icon', name: 'tinybird' },
  },
  [HostedIntegrationType.Perplexity]: {
    label: 'Perplexity',
    icon: { type: 'icon', name: 'perplexity' },
  },
  [HostedIntegrationType.AwsKbRetrieval]: {
    label: 'AWS Knowledge Base Retrieval',
    icon: { type: 'icon', name: 'awsBedrock' },
  },
  [HostedIntegrationType.BraveSearch]: {
    label: 'Brave Search',
    icon: { type: 'icon', name: 'brave' },
  },
  [HostedIntegrationType.EverArt]: {
    label: 'EverArt',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Fetch]: {
    label: 'Fetch',
    icon: { type: 'icon', name: 'globe' },
  },
  [HostedIntegrationType.GitLab]: {
    label: 'GitLab',
    icon: { type: 'icon', name: 'gitlab' },
  },
  [HostedIntegrationType.GoogleMaps]: {
    label: 'Google Maps',
    icon: { type: 'icon', name: 'mapPin' },
  },
  [HostedIntegrationType.Sentry]: {
    label: 'Sentry',
    icon: { type: 'icon', name: 'sentry' },
  },
  [HostedIntegrationType.Puppeteer]: {
    label: 'Puppeteer',
    icon: { type: 'icon', name: 'appWindow' },
  },
  [HostedIntegrationType.Time]: {
    label: 'Time',
    icon: { type: 'icon', name: 'clock' },
  },
  [HostedIntegrationType.browserbase]: {
    label: 'browserbase',
    icon: { type: 'icon', name: 'browserbase' },
  },
  [HostedIntegrationType.Neon]: {
    label: 'Neon',
    icon: { type: 'icon', name: 'neon' },
  },
  [HostedIntegrationType.Postgres]: {
    label: 'PostgreSQL',
    icon: { type: 'icon', name: 'postgres' },
  },
  [HostedIntegrationType.Redis]: {
    label: 'Redis',
    icon: { type: 'icon', name: 'redis' },
  },
  [HostedIntegrationType.Jira]: {
    label: 'Jira',
    icon: { type: 'icon', name: 'jira' },
  },
  [HostedIntegrationType.Attio]: {
    label: 'Attio',
    icon: { type: 'icon', name: 'attio' },
  },
  [HostedIntegrationType.Ghost]: {
    label: 'Ghost',
    icon: { type: 'icon', name: 'ghost' },
  },
  [HostedIntegrationType.Supabase]: {
    label: 'Supabase',
    icon: { type: 'icon', name: 'supabase' },
  },
  [HostedIntegrationType.Figma]: {
    label: 'Figma',
    icon: { type: 'icon', name: 'figma' },
  },
  [HostedIntegrationType.Hyperbrowser]: {
    label: 'Hyperbrowser',
    icon: { type: 'icon', name: 'hyperbrowser' },
  },
  [HostedIntegrationType.Audiense]: {
    label: 'Audiense',
    icon: { type: 'icon', name: 'audiense' },
  },
  [HostedIntegrationType.Apify]: {
    label: 'Apify',
    icon: { type: 'icon', name: 'apify' },
  },
  [HostedIntegrationType.Exa]: {
    label: 'Exa',
    icon: { type: 'icon', name: 'exa' },
  },
  [HostedIntegrationType.YepCode]: {
    label: 'YepCode',
    icon: { type: 'icon', name: 'yepcode' },
  },
  [HostedIntegrationType.Monday]: {
    label: 'Monday',
    icon: { type: 'icon', name: 'monday' },
  },
  [HostedIntegrationType.AgentQL]: {
    label: 'AgentQL',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.AgentRPC]: {
    label: 'AgentRPC',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.AstraDB]: {
    label: 'AstraDB',
    icon: { type: 'icon', name: 'database' },
  },
  [HostedIntegrationType.Bankless]: {
    label: 'Bankless',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Bicscan]: {
    label: 'Bicscan',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Chargebee]: {
    label: 'Chargebee',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Chronulus]: {
    label: 'Chronulus',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.CircleCI]: {
    label: 'CircleCI',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Codacy]: {
    label: 'Codacy',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.CodeLogic]: {
    label: 'CodeLogic',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Convex]: {
    label: 'Convex',
    icon: { type: 'icon', name: 'database' },
  },
  [HostedIntegrationType.Dart]: {
    label: 'Dart',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.DevHubCMS]: {
    label: 'DevHub CMS',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Elasticsearch]: {
    label: 'Elasticsearch',
    icon: { type: 'icon', name: 'database' },
  },
  [HostedIntegrationType.ESignatures]: {
    label: 'ESignatures',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Fewsats]: {
    label: 'Fewsats',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Firecrawl]: {
    label: 'Firecrawl',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Graphlit]: {
    label: 'Graphlit',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Heroku]: {
    label: 'Heroku',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.IntegrationAppHubspot]: {
    label: 'HubSpot (via Integration.app)',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.LaraTranslate]: {
    label: 'LaraTranslate',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Logfire]: {
    label: 'Logfire',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Langfuse]: {
    label: 'Langfuse',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.LingoSupabase]: {
    label: 'Lingo (Supabase)',
    icon: { type: 'icon', name: 'supabase' },
  },
  [HostedIntegrationType.Make]: {
    label: 'Make',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Meilisearch]: {
    label: 'Meilisearch',
    icon: { type: 'icon', name: 'search' },
  },
  [HostedIntegrationType.Momento]: {
    label: 'Momento',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Neo4jAura]: {
    label: 'Neo4j Aura',
    icon: { type: 'icon', name: 'database' },
  },
  [HostedIntegrationType.Octagon]: {
    label: 'Octagon',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Paddle]: {
    label: 'Paddle',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.PayPal]: {
    label: 'PayPal',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Qdrant]: {
    label: 'Qdrant',
    icon: { type: 'icon', name: 'database' },
  },
  [HostedIntegrationType.Raygun]: {
    label: 'Raygun',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Rember]: {
    label: 'Rember',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Riza]: {
    label: 'Riza',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Search1API]: {
    label: 'Search1 API',
    icon: { type: 'icon', name: 'search' },
  },
  [HostedIntegrationType.Semgrep]: {
    label: 'Semgrep',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Tavily]: {
    label: 'Tavily',
    icon: { type: 'icon', name: 'search' },
  },
  [HostedIntegrationType.Unstructured]: {
    label: 'Unstructured',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Vectorize]: {
    label: 'Vectorize',
    icon: { type: 'icon', name: 'database' },
  },
  [HostedIntegrationType.Xero]: {
    label: 'Xero',
    icon: { type: 'icon', name: 'mcp' },
  },
  [HostedIntegrationType.Readwise]: {
    label: 'Readwise',
    icon: { type: 'icon', name: 'readwise' },
  },
  [HostedIntegrationType.Airbnb]: {
    label: 'Airbnb',
    icon: { type: 'icon', name: 'airbnb' },
  },
  [HostedIntegrationType.Mintlify]: {
    label: 'Mintlify',
    icon: { type: 'icon', name: 'mintlify' },
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

  return INTEGRATION_TYPE_VALUES[integration.type]
}
