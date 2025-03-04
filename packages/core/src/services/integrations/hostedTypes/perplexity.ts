import { HostedIntegrationConfig } from './types'
import { uvxCommand } from './utils'

export default {
  description:
    'Integration for interacting with the Perplexity API, enabling chat completions with citations.',
  command: uvxCommand({
    name: 'mcp-server-perplexity',
    repository: 'https://github.com/adhikasp/mcp-reddit.git',
  }),
  env: {
    PERPLEXITY_API_KEY: {
      label: 'Perplexity API Key',
      description: 'The API Key for the Perplexity API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
} as HostedIntegrationConfig
