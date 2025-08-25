import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const PADDLE_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@paddle/paddle-mcp',
    args: '--api-key=$PADDLE_API_KEY --environment=$PADDLE_ENVIRONMENT',
  }),
  envSource: 'https://github.com/PaddleHQ/paddle-mcp-server',
  env: {
    PADDLE_API_KEY: {
      label: 'PADDLE_API_KEY',
      placeholder: 'your-api-key-here',
      required: true,
    },
    PADDLE_ENVIRONMENT: {
      label: 'PADDLE_ENVIRONMENT',
      description: 'Specify "sandbox" or "production"',
      placeholder: 'sandbox',
      required: true,
    },
  },
}

export default PADDLE_MCP_CONFIG
