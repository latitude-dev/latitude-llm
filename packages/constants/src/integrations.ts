export enum IntegrationType {
  Latitude = 'latitude', // For internal use only
  ExternalMCP = 'custom_mcp',
  HostedMCP = 'mcp_server',
}

export enum HostedIntegrationType {
  Stripe = 'stripe',
  Slack = 'slack',
  Github = 'github',
  Notion = 'notion',
  Twitter = 'twitter',
  Airtable = 'airtable',
  Linear = 'linear',
  YoutubeCaptions = 'youtube_captions',
  Reddit = 'reddit',
  Telegram = 'telegram',
  Tinybird = 'tinybird',
  Perplexity = 'perplexity',

  AwsKbRetrieval = 'aws_kb_retrieval',
  BraveSearch = 'brave_search',
  EverArt = 'ever_art',
  Fetch = 'fetch',
  GitLab = 'gitlab',
  GoogleMaps = 'google_maps',
  Sentry = 'sentry',
  Puppeteer = 'puppeteer',
  Time = 'time',
  browserbase = 'browserbase',
  Neon = 'neon',
  Postgres = 'postgres',
  Supabase = 'supabase',
  Redis = 'redis',
  Jira = 'jira',
  Attio = 'attio',
  Ghost = 'ghost',

  // Require all auth file :point_down:
  // Gmail = 'google_drive',
  // GoogleCalendar = 'google_drive',
  // GoogleDrive = 'google_drive',
  // GoogleWorkspace = 'google_workspace', // env vars not supported (?)

  // TODO: implement these
  // Wordpress = 'wordpress', // Not on OpenTools
  // Discord = 'discord', // Not on OpenTools
  // Intercom = 'intercom', // Not on OpenTools

  // Hubspot = 'hubspot', // Docker based
  // Loops = 'loops', // Does not exist
}
