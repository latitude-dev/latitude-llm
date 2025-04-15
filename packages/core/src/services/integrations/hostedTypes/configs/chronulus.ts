import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const CHRONULUS_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'chronulus-mcp',
  }),
  envSource: 'https://github.com/chronulus/chronulus-mcp',
  env: {
    CHRONULUS_API_KEY: {
      label: 'CHRONULUS_API_KEY',
      placeholder: '<YOUR_CHRONULUS_API_KEY>',
      required: true,
    },
  },
}

export default CHRONULUS_MCP_CONFIG
