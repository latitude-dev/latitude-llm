import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const MAKE_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@makehq/mcp-server',
  }),
  envSource: 'https://github.com/integromat/make-mcp-server',
  env: {
    MAKE_API_KEY: {
      label: 'MAKE_API_KEY',
      placeholder: '<your-api-key>',
      required: true,
    },
    MAKE_ZONE: {
      label: 'MAKE_ZONE',
      placeholder: '<your-zone>',
      required: true,
    },
    MAKE_TEAM: {
      label: 'MAKE_TEAM',
      placeholder: '<your-team-id>',
      required: true,
    },
  },
}

export default MAKE_MCP_CONFIG
