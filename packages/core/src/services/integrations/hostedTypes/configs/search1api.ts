import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const SEARCH1API_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'search1api-mcp',
  }),
  envSource: 'https://github.com/fatwang2/search1api-mcp',
  env: {
    SEARCH1API_KEY: {
      label: 'SEARCH1API_KEY',
      placeholder: 'YOUR_SEARCH1API_KEY',
      required: true,
    },
  },
}

export default SEARCH1API_MCP_CONFIG
