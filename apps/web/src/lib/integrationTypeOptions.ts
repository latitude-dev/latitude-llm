import {
  HostedIntegrationType,
  IntegrationType,
} from '@latitude-data/constants'
import { IntegrationDto } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

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
  [HostedIntegrationType.Audiense]: {
    label: 'Audiense',
    icon: 'audiense',
  },
  [HostedIntegrationType.Apify]: {
    label: 'Apify',
    icon: 'apify',
  },
  [HostedIntegrationType.Exa]: {
    label: 'Exa',
    icon: 'exa',
  },
  [HostedIntegrationType.YepCode]: {
    label: 'YepCode',
    icon: 'yepcode',
  },
  [HostedIntegrationType.Monday]: {
    label: 'Monday',
    icon: 'monday',
  },
  [HostedIntegrationType.AgentQL]: {
    label: 'AgentQL',
    icon: 'mcp',
  },
  [HostedIntegrationType.AgentRPC]: {
    label: 'AgentRPC',
    icon: 'mcp',
  },
  [HostedIntegrationType.AstraDB]: {
    label: 'AstraDB',
    icon: 'database',
  },
  [HostedIntegrationType.Bankless]: {
    label: 'Bankless',
    icon: 'mcp',
  },
  [HostedIntegrationType.Bicscan]: {
    label: 'Bicscan',
    icon: 'mcp',
  },
  [HostedIntegrationType.Chargebee]: {
    label: 'Chargebee',
    icon: 'mcp',
  },
  [HostedIntegrationType.Chronulus]: {
    label: 'Chronulus',
    icon: 'mcp',
  },
  [HostedIntegrationType.CircleCI]: {
    label: 'CircleCI',
    icon: 'mcp', // Assuming generic icon
  },
  [HostedIntegrationType.Codacy]: {
    label: 'Codacy',
    icon: 'mcp',
  },
  [HostedIntegrationType.CodeLogic]: {
    label: 'CodeLogic',
    icon: 'mcp',
  },
  [HostedIntegrationType.Convex]: {
    label: 'Convex',
    icon: 'database',
  },
  [HostedIntegrationType.Dart]: {
    label: 'Dart',
    icon: 'mcp',
  },
  [HostedIntegrationType.DevHubCMS]: {
    label: 'DevHub CMS',
    icon: 'mcp',
  },
  [HostedIntegrationType.Elasticsearch]: {
    label: 'Elasticsearch',
    icon: 'database',
  },
  [HostedIntegrationType.ESignatures]: {
    label: 'ESignatures',
    icon: 'mcp',
  },
  [HostedIntegrationType.Fewsats]: {
    label: 'Fewsats',
    icon: 'mcp',
  },
  [HostedIntegrationType.Firecrawl]: {
    label: 'Firecrawl',
    icon: 'mcp',
  },
  [HostedIntegrationType.Graphlit]: {
    label: 'Graphlit',
    icon: 'mcp',
  },
  [HostedIntegrationType.Heroku]: {
    label: 'Heroku',
    icon: 'mcp', // Assuming generic icon
  },
  [HostedIntegrationType.IntegrationAppHubspot]: {
    label: 'HubSpot (via Integration.app)',
    icon: 'mcp', // Assuming generic icon, specific 'hubspot' might exist
  },
  [HostedIntegrationType.LaraTranslate]: {
    label: 'LaraTranslate',
    icon: 'mcp',
  },
  [HostedIntegrationType.Logfire]: {
    label: 'Logfire',
    icon: 'mcp',
  },
  [HostedIntegrationType.Langfuse]: {
    label: 'Langfuse',
    icon: 'mcp',
  },
  [HostedIntegrationType.LingoSupabase]: {
    label: 'Lingo (Supabase)',
    icon: 'supabase', // Reusing existing icon
  },
  [HostedIntegrationType.Make]: {
    label: 'Make',
    icon: 'mcp', // Assuming generic icon
  },
  [HostedIntegrationType.Meilisearch]: {
    label: 'Meilisearch',
    icon: 'search',
  },
  [HostedIntegrationType.Momento]: {
    label: 'Momento',
    icon: 'mcp',
  },
  [HostedIntegrationType.Neo4jAura]: {
    label: 'Neo4j Aura',
    icon: 'database',
  },
  [HostedIntegrationType.Octagon]: {
    label: 'Octagon',
    icon: 'mcp',
  },
  [HostedIntegrationType.Paddle]: {
    label: 'Paddle',
    icon: 'mcp',
  },
  [HostedIntegrationType.PayPal]: {
    label: 'PayPal',
    icon: 'mcp', // Assuming generic icon
  },
  [HostedIntegrationType.Qdrant]: {
    label: 'Qdrant',
    icon: 'database',
  },
  [HostedIntegrationType.Raygun]: {
    label: 'Raygun',
    icon: 'mcp',
  },
  [HostedIntegrationType.Rember]: {
    label: 'Rember',
    icon: 'mcp',
  },
  [HostedIntegrationType.Riza]: {
    label: 'Riza',
    icon: 'mcp',
  },
  [HostedIntegrationType.Search1API]: {
    label: 'Search1 API',
    icon: 'search',
  },
  [HostedIntegrationType.Semgrep]: {
    label: 'Semgrep',
    icon: 'mcp',
  },
  [HostedIntegrationType.Tavily]: {
    label: 'Tavily',
    icon: 'search',
  },
  [HostedIntegrationType.Unstructured]: {
    label: 'Unstructured',
    icon: 'mcp',
  },
  [HostedIntegrationType.Vectorize]: {
    label: 'Vectorize',
    icon: 'database',
  },
  [HostedIntegrationType.Xero]: {
    label: 'Xero',
    icon: 'mcp',
  },
  [HostedIntegrationType.Readwise]: {
    label: 'Readwise',
    icon: 'readwise',
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
