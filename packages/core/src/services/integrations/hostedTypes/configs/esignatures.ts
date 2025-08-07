import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const ESIGNATURES_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'mcp-server-esignatures',
  }),
  envSource: 'https://github.com/esignaturescom/mcp-server-esignatures',
  env: {
    ESIGNATURES_SECRET_TOKEN: {
      label: 'ESIGNATURES_SECRET_TOKEN',
      placeholder: 'your-secret-token',
      required: true,
    },
  },
}

export default ESIGNATURES_MCP_CONFIG
