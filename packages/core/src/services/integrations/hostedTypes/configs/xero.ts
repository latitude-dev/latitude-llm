import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const XERO_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@xeroapi/xero-mcp-server@latest',
  }),
  envSource: 'https://github.com/XeroAPI/xero-mcp-server',
  env: {
    XERO_CLIENT_ID: {
      label: 'XERO_CLIENT_ID',
      placeholder: 'your_client_id_here',
      required: true,
    },
    XERO_CLIENT_SECRET: {
      label: 'XERO_CLIENT_SECRET',
      placeholder: 'your_client_secret_here',
      required: true,
    },
  },
}

export default XERO_MCP_CONFIG
