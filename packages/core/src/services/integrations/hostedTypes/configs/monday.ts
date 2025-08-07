import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const MONDAY_MCP_CONFIG: HostedIntegrationConfig = {
  description: 'Monday MCP Server for connecting to Monday.com',
  command: uvxCommand({
    name: 'mcp-server-monday',
    repository: 'https://github.com/sakce/mcp-server-monday',
  }),
  env: {
    MONDAY_API_KEY: {
      label: 'API Key',
      description: 'Your Monday.com API key',
      placeholder: 'your-monday-api-key',
      required: true,
    },
    MONDAY_WORKSPACE_NAME: {
      label: 'Workspace Name',
      description: 'The name of your Monday.com workspace',
      placeholder: 'your-monday-workspace-name',
      required: true,
    },
  },
  envSource: 'https://developer.monday.com/api-reference/docs/authentication#developer-tab',
}

export default MONDAY_MCP_CONFIG
