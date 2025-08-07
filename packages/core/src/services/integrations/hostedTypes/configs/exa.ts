import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const EXA_MCP_CONFIG: HostedIntegrationConfig = {
  description: 'Exa MCP Server for web search and data extraction',
  command: npxCommand({
    package: 'github:exa-labs/exa-mcp-server',
  }),
  env: {
    EXA_API_KEY: {
      label: 'API Key',
      description: 'The API key for your Exa account',
      placeholder: 'your-exa-api-key',
      required: true,
    },
  },
  envSource: 'https://dashboard.exa.ai/login?redirect=/api-keys',
}

export default EXA_MCP_CONFIG
