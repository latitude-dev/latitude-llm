import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const RIZA_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@riza-io/riza-mcp',
  }),
  envSource: 'https://github.com/riza-io/riza-mcp',
  env: {
    RIZA_API_KEY: {
      label: 'RIZA_API_KEY',
      placeholder: 'your-api-key',
      required: true,
    },
  },
}

export default RIZA_MCP_CONFIG
