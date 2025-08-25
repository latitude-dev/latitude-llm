import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const AGENTRPC_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'agentrpc mcp',
  }),
  envSource: 'https://github.com/agentrpc/agentrpc-mcp',
  env: {
    AGENTRPC_API_SECRET: {
      label: 'AGENTRPC_API_SECRET',
      placeholder: '<YOUR_API_SECRET>',
      required: true,
    },
  },
}

export default AGENTRPC_MCP_CONFIG
