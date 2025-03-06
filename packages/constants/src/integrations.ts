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

  // Memory = 'memory', // short-lived file storage, useless
  // SequentialThinking = 'sequential_thinking', // useless
  Time = 'time',

  browserbase = 'browserbase',
  Neon = 'neon',

  // Gmail = 'google_drive', // env vars not supported, requires auth file
  // GoogleCalendar = 'google_drive', // env vars not supported, requires auth file
  // GoogleDrive = 'google_drive', // env vars not supported, requires auth file
  // Postgres = 'postgres', // Uses a custom parameter in the command instead of env vars
  // Redis = 'redis', // Uses a custom parameter in the command instead of env vars
  // SQLite = 'sqlite', // Uses a custom parameter in the command instead of env vars

  // GoogleWorkspace = 'google_workspace', // env vars not supported (?)

  // Wordpress = 'wordpress', // Not on OpenTools
  // Discord = 'discord', // Not on OpenTools
  // Intercom = 'intercom', // Not on OpenTools
  // Jira = 'jira', // Not on OpenTools
  // Supabase = 'supabase', // Not on OpenTools
  // Hubspot = 'hubspot', // Not on OpenTools
  // Attio = 'attio', // Not on OpenTools
  // Loops = 'loops', // Not on OpenTools
  // Ghost = 'ghost', // Not on OpenTools
}
