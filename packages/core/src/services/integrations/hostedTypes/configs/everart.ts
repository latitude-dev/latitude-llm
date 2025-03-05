import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Integration for interacting with the EverArt API, enabling the generation of art.',
  command: npxCommand({
    package: '@modelcontextprotocol/server-everart',
  }),
  env: {
    EVERART_API_KEY: {
      label: 'EverArt API Key',
      description: 'The API key for the EverArt API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource: 'https://www.everart.ai/api',
} as HostedIntegrationConfig
