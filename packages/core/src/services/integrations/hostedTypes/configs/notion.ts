import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Tools for the Notion API, enabling your AI to interact with Notion workspaces.',
  command: npxCommand({ package: '@suekou/mcp-notion-server' }),
  env: {
    NOTION_API_TOKEN: {
      label: 'Notion API Token',
      description: 'The token for the Notion API',
      placeholder: 'secret_xxx',
      required: true,
    },
  },
  envSource: 'https://developers.notion.com/docs/create-a-notion-integration#getting-started',
} as HostedIntegrationConfig
