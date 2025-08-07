import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Integration for interacting with Ghost Admin API',
  command: npxCommand({
    package: '@mtane0412/ghost-mcp-server',
  }),
  env: {
    GHOST_URL: {
      label: 'Ghost URL',
      description: 'The URL of your Ghost instance',
      placeholder: 'https://example.com',
      required: true,
    },
    GHOST_ADMIN_API_KEY: {
      label: 'Ghost Admin API Key',
      description: 'The API key for the Ghost Admin API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource: 'https://ghost.org/docs/admin-api/javascript/',
} as HostedIntegrationConfig
