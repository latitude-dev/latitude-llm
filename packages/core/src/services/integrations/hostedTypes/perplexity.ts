import { HostedIntegrationConfig } from './types'

export default {
  description:
    'Integration for interacting with the Perplexity API, enabling chat completions with citations.',
  command: 'uvx mcp-server-perplexity',
  env: {
    PERPLEXITY_API_KEY: {
      label: 'Perplexity API Key',
      description: 'The API Key for the Perplexity API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
} as HostedIntegrationConfig
