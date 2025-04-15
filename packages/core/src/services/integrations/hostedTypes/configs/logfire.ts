import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'
const LOGFIRE_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'logfire-mcp',
  }),
  envSource: 'https://github.com/pydantic/logfire-mcp',
  env: {
    LOGFIRE_READ_TOKEN: {
      label: 'LOGFIRE_READ_TOKEN',
      placeholder: 'YOUR_READ_TOKEN',
      required: true,
    },
  },
}

export default LOGFIRE_MCP_CONFIG
