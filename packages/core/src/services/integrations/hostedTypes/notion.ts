import { HostedIntegrationConfig } from './types'

export default {
  description:
    'Tools for the Notion API, enabling your AI to interact with Notion workspaces.',
  command: '@suekou/mcp-notion-server',
  env: {
    NOTION_API_TOKEN: {
      label: 'Notion API Token',
      description: 'The token for the Notion API',
      placeholder: 'secret_xxx',
      required: true,
    },
  },
} as HostedIntegrationConfig
