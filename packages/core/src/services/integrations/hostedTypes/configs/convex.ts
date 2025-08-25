import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const CONVEX_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'convex@latest',
    args: 'mcp start',
  }),
  envSource: 'https://github.com/get-convex/convex-mcp',
  env: {},
}

export default CONVEX_MCP_CONFIG
