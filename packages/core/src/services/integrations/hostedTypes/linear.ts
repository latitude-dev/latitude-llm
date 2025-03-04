import { HostedIntegrationConfig } from './types'

export default {
  description: `A set of tools for interacting with Linear's issue tracking system, enabling LLMs to create, update, search, and manage Linear issues.`,
  command: 'npx -y linear-mcp-server',
  env: {
    LINEAR_API_KEY: {
      label: 'Linear API Key',
      description: 'Your Linear API key',
      placeholder: 'your_linear_api_key_here',
      required: true,
    },
  },
} as HostedIntegrationConfig
