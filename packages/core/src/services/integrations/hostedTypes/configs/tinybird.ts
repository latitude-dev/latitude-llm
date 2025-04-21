import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

export default {
  description: `An MCP server to interact with a Tinybird Workspace.`,
  command: uvxCommand({
    name: 'mcp-tinybird',
    repository: 'https://github.com/tinybirdco/mcp-tinybird.git',
  }),
  env: {
    TB_API_URL: {
      label: 'Tinybird API URL',
      description: 'Your Tinybird API URL',
      placeholder: '<your-tinybird-api-url>',
      required: true,
    },
    TB_ADMIN_TOKEN: {
      label: 'Tinybird Admin Token',
      description: 'Your Tinybird Admin Token',
      placeholder: '<your-tinybird-admin-token>',
      required: true,
    },
  },
  envSource:
    'https://www.tinybird.co/docs/get-started/administration/auth-tokens#create-a-token',
} as HostedIntegrationConfig
