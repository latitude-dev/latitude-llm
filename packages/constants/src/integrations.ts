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

  // Reddit = 'reddit', // uvx
  // Telegram = 'telegram', // uvx
  // GoogleWorkspace = 'google_workspace', // uvx
  // Tinybird = 'tinybird', // uvx
  // Perplexity = 'perplexity', // uvx

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
