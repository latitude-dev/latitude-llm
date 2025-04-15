import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'
const MOMENTO_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@gomomento/mcp-momento',
  }),
  envSource: 'https://github.com/momentohq/mcp-momento',
  env: {
    MOMENTO_API_KEY: {
      label: 'MOMENTO_API_KEY',
      placeholder: 'your-api-key',
      required: true,
    },
    MOMENTO_CACHE_NAME: {
      label: 'MOMENTO_CACHE_NAME',
      placeholder: 'your-cache-name',
      required: true,
    },
    DEFAULT_TTL_SECONDS: {
      label: 'DEFAULT_TTL_SECONDS',
      placeholder: '60',
      required: true,
    },
  },
}

export default MOMENTO_MCP_CONFIG
