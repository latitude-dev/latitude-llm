import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const FEWSATS_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'fewsats-mcp',
  }),
  envSource: 'https://github.com/Fewsats/fewsats-mcp',
  env: {
    FEWSATS_API_KEY: {
      label: 'FEWSATS_API_KEY',
      placeholder: 'YOUR_FEWSATS_API_KEY',
      required: true,
    },
  },
}

export default FEWSATS_MCP_CONFIG
