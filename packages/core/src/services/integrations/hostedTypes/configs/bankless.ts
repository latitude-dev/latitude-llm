import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const BANKLESS_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@bankless/onchain-mcp',
  }),
  envSource: 'https://github.com/BanklessDAO/bankless-mcp',
  env: {
    BANKLESS_API_TOKEN: {
      label: 'BANKLESS_API_TOKEN',
      placeholder: 'your_api_token_here',
      required: true,
    },
  },
}

export default BANKLESS_MCP_CONFIG
