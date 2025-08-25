import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const INTEGRATION_APP_HUBSPOT_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@integration-app/mcp-server',
  }),
  envSource: 'https://github.com/integration-app/mcp-server',
  env: {
    INTEGRATION_APP_TOKEN: {
      label: 'INTEGRATION_APP_TOKEN',
      placeholder: '<your-integration-app-token>',
      required: true,
    },
    INTEGRATION_KEY: {
      label: 'INTEGRATION_KEY',
      placeholder: 'hubspot',
      required: true,
    },
  },
}

export default INTEGRATION_APP_HUBSPOT_MCP_CONFIG
