import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const HEROKU_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@heroku/mcp-server',
  }),
  envSource: 'https://github.com/heroku/heroku-mcp-server',
  env: {
    HEROKU_API_KEY: {
      label: 'HEROKU_API_KEY',
      placeholder: '<YOUR_HEROKU_AUTH_TOKEN>',
      required: true,
    },
  },
}

export default HEROKU_MCP_CONFIG
