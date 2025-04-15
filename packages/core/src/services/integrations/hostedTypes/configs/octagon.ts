import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'
const OCTAGON_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'octagon-mcp',
  }),
  envSource: 'https://github.com/OctagonAI/octagon-mcp-server',
  env: {
    OCTAGON_API_KEY: {
      label: 'OCTAGON_API_KEY',
      placeholder: 'your_octagon_api_key',
      required: true,
    },
  },
}

export default OCTAGON_MCP_CONFIG
