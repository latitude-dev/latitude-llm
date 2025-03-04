import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Integrates the Brave Search API, providing both web and local search capabilities.',
  env: {
    BRAVE_API_KEY: {
      label: 'Brave API Key',
      description: 'The API key for the Brave Search API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  commandFn: () =>
    npxCommand({
      package: '@modelcontextprotocol/server-brave-search',
    }),
} as HostedIntegrationConfig
