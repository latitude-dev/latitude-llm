import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const RAYGUN_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@raygun.io/mcp-server-raygun',
  }),
  envSource: 'https://github.com/MindscapeHQ/mcp-server-raygun',
  env: {
    RAYGUN_PAT_TOKEN: {
      label: 'RAYGUN_PAT_TOKEN',
      placeholder: 'your-pat-token-here',
      required: true,
    },
  },
}

export default RAYGUN_MCP_CONFIG
