import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const PAYPAL_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@paypal/mcp',
    args: '--tools=all',
  }),
  envSource: 'https://mcp.paypal.com/',
  env: {
    PAYPAL_ACCESS_TOKEN: {
      label: 'PAYPAL_ACCESS_TOKEN',
      placeholder: 'YOUR_PAYPAL_ACCESS_TOKEN',
      required: true,
    },
    PAYPAL_ENVIRONMENT: {
      label: 'PAYPAL_ENVIRONMENT',
      placeholder: 'SANDBOX',
      required: true,
    },
  },
}

export default PAYPAL_MCP_CONFIG
