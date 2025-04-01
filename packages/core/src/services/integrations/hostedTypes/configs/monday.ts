import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const MONDAY_MCP_CONFIG: HostedIntegrationConfig = {
  description: 'Monday MCP Server for connecting to Monday.com',
  command: uvxCommand({
    name: 'mcp-server-monday',
    repository: 'https://github.com/sakce/mcp-server-monday',
  }),
  env: {
    MONDAY_API_TOKEN: {
      label: 'API Token',
      description: 'Your Monday.com API token',
      placeholder: 'your-monday-api-token',
      required: true,
    },
    MONDAY_WORKSPACE_NAME: {
      label: 'Workspace Name',
      description: 'The name of your Monday.com workspace',
      placeholder: 'your-monday-workspace-name',
      required: true,
    },
  },
  envSource:
    'https://developer.monday.com/api-reference/docs/authentication#developer-tab',
}

export default MONDAY_MCP_CONFIG
