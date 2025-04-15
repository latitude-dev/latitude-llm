import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const AGENTQL_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'agentql-mcp',
  }),
  envSource: 'https://github.com/agentql/agentql-mcp',
  env: {
    AGENTQL_API_KEY: {
      label: 'AGENTQL_API_KEY',
      placeholder: 'YOUR_API_KEY',
      required: true,
    },
  },
}

export default AGENTQL_MCP_CONFIG
