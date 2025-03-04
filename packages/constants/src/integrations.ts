export enum IntegrationType {
  Latitude = 'latitude', // For internal use only
  ExternalMCP = 'custom_mcp',
  HostedMCP = 'mcp_server',
}

export enum HostedIntegrationType {
  Stripe = 'stripe',
  Slack = 'slack',
  // Github = 'github',
  // Reddit = 'reddit',
  // Youtube = 'youtube',
  // Airtable = 'airtable',
  // Notion = 'notion',
  // Wordpress = 'wordpress',
  // X = 'twitter',
  // Linear = 'linear',
  // Telegram = 'telegram',
  // Tinybird = 'tinybird',
  // Perplexity = 'perplexity',
  // GoogleWorkspace = 'google_workspace',
  // Supabase = 'supabase',
  // Hubspot = 'hubspot',
  // Attio = 'attio',
  // Discord = 'discord',
  // Loops = 'loops',
  // Intercom = 'intercom',
  // Jira = 'jira',
  // Ghost = 'ghost',
}
