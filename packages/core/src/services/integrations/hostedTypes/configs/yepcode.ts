import { HostedIntegrationConfig } from '../types'
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
    YEPCODE_PROCESSES_AS_MCP_TOOLS: {
      label: 'Processes as MCP Tools',
      description: 'Set to "true" to expose YepCode processes as individual MCP tools',
      placeholder: 'true',
      required: false,
    },
  },
  envSource: 'https://yepcode.io/docs/settings/api-credentials',
}

export default YEPCODE_MCP_CONFIG
