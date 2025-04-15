import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const TAVILY_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'tavily-mcp',
  }),
  envSource: 'https://github.com/tavily-ai/tavily-mcp',
  env: {
    TAVILY_API_KEY: {
      label: 'TAVILY_API_KEY',
      placeholder: 'your-api-key-here',
      required: true,
    },
  },
}

export default TAVILY_MCP_CONFIG
