import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const CODACY_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@codacy/codacy-mcp',
  }),
  envSource: 'https://github.com/codacy/codacy-mcp-server/',
  env: {
    CODACY_ACCOUNT_TOKEN: {
      label: 'CODACY_ACCOUNT_TOKEN',
      placeholder: '<YOUR_TOKEN>',
      required: true,
    },
  },
}

export default CODACY_MCP_CONFIG
