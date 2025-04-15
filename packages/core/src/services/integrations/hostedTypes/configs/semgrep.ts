import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const SEMGREP_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'semgrep-mcp',
  }),
  envSource: 'https://github.com/semgrep/mcp',
  env: {
    SEMGREP_APP_TOKEN: {
      label: 'SEMGREP_APP_TOKEN',
      placeholder: '<token>',
      required: true,
    },
  },
}

export default SEMGREP_MCP_CONFIG
