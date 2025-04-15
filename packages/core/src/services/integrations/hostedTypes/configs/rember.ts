import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const REMBER_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@getrember/mcp',
    args: '--api-key=$REMEMBER_API_KEY',
  }),
  envSource: 'https://github.com/rember/rember-mcp',
  env: {
    REMEMBER_API_KEY: {
      label: 'REMEMBER_API_KEY',
      description: 'Your Remember API key',
      placeholder: 'your-api-key-here',
      required: true,
    },
  },
}

export default REMBER_MCP_CONFIG
