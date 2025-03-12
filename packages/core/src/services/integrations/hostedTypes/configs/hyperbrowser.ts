import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Integration for interacting with Hyperbrowser',
  command: npxCommand({
    package: 'hyperbrowser-mcp',
  }),
  env: {
    HB_API_KEY: {
      label: 'Hyperbrowser API Key',
      description: 'The API key for the Hyperbrowser API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource:
    'https://www.hyperbrowser.ai/',
} as HostedIntegrationConfig
