import { HostedIntegrationConfig } from './types'

export default {
  description:
    'Tools for the Notion API, enabling your AI to interact with Notion workspaces.',
  command: 'npx -y airtable-mcp-server',
  env: {
    AIRTABLE_API_KEY: {
      label: 'Airtable API Token',
      description: 'Your Airtable API token',
      placeholder: 'pat123.abc123',
      required: true,
    },
  },
} as HostedIntegrationConfig
