import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Integration for interacting with Audiense',
  command: npxCommand({
    package: 'github:AudienseCo/mcp-audiense-insights',
  }),
  env: {
    AUDIENSE_CLIENT_ID: {
      label: 'Audiense Client ID',
      description: 'Your Audiense Client ID',
      placeholder: 'your-audiense-client-id',
      required: true,
    },
    AUDIENSE_CLIENT_SECRET: {
      label: 'Audiense Client Secret',
      description: 'Your Audiense Client Secret',
      placeholder: 'your-audiense-client-secret',
      required: true,
    },
    TWITTER_BEARER_TOKEN: {
      label: 'Twitter Bearer Token',
      description: 'Your Twitter Bearer Token',
      placeholder: 'your-twitter-bearer-token',
      required: false,
    },
  },
  envSource:
    'https://github.com/geclos/mcp-audiense-insights?tab=readme-ov-file#%EF%B8%8F-configuring-claude-desktop',
} as HostedIntegrationConfig
