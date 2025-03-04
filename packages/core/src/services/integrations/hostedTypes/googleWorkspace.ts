import { HostedIntegrationConfig } from './types'

export default {
  description:
    'Interact with Google Workspace (G Suite) products, including Gmail and Calendar, with features like email search, calendar event management, and multi-account support.',
  command: 'npx -y @suekou/mcp-notion-server',
  env: {
    NOTION_API_TOKEN: {
      label: 'Notion API Token',
      description: 'The token for the Notion API',
      placeholder: 'secret_xxx',
      required: true,
    },
  },
} as HostedIntegrationConfig
