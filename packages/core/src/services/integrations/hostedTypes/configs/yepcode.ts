import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const YEPCODE_MCP_CONFIG: HostedIntegrationConfig = {
  description: 'YepCode MCP Server for code execution and tools creation',
  command: npxCommand({
    package: '@yepcode/mcp-server',
  }),
  env: {
    YEPCODE_API_TOKEN: {
      label: 'API Token',
      description: 'Your YepCode API token',
      placeholder: 'your-yepcode-api-token',
      required: true,
    },
  },
  envSource: 'https://yepcode.io/docs/settings/api-credentials',
}

export default YEPCODE_MCP_CONFIG
