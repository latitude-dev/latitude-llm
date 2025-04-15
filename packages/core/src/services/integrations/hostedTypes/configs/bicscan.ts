import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const BICSCAN_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'bicscan-mcp',
    args: '--from git+https://github.com/ahnlabio/bicscan-mcp',
  }),
  envSource: 'https://github.com/ahnlabio/bicscan-mcp',
  env: {
    BICSCAN_API_KEY: {
      label: 'BICSCAN_API_KEY',
      placeholder: 'YOUR_BICSCAN_API_KEY_HERE',
      required: true,
    },
  },
}

export default BICSCAN_MCP_CONFIG
