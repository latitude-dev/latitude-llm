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
  // Reddit = 'reddit', // non-standard tool
  // Youtube = 'youtube', // non-standard tool - also only to download captions
  // Wordpress = 'wordpress', // Not on OpenTools
  // Telegram = 'telegram', // non-standard tool
  // GoogleWorkspace = 'google_workspace', // Not on OpenTools
  // Discord = 'discord', // Not on OpenTools
  // Intercom = 'intercom', // Not on OpenTools
  // Jira = 'jira', // Not on OpenTools
  // Airtable = 'airtable',
  // Linear = 'linear',
  // Tinybird = 'tinybird',
  // Perplexity = 'perplexity',
  // Supabase = 'supabase',
  // Hubspot = 'hubspot',
  // Attio = 'attio',
  // Loops = 'loops',
  // Ghost = 'ghost',
}
