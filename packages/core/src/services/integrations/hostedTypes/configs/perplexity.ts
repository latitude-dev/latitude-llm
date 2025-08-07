import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'An MCP server implementation that integrates the Sonar API to provide Claude with unparalleled real-time, web-wide research.',
  command: npxCommand({
    package: 'server-perplexity-ask',
  }),
  env: {
    PERPLEXITY_API_KEY: {
      label: 'Perplexity API Key',
      description: 'The API Key for the Perplexity API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource:
    'https://github.com/ppl-ai/modelcontextprotocol/tree/main?tab=readme-ov-file#step-2-get-a-sonar-api-key',
} as HostedIntegrationConfig
