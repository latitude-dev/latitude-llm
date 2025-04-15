import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const CHARGEBEE_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@chargebee/mcp',
  }),
  envSource: 'https://github.com/chargebee/chargebee-mcp',
  env: {},
}

export default CHARGEBEE_MCP_CONFIG
