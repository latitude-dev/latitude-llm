import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const DEVHUB_CMS_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'devhub-cms-mcp',
  }),
  envSource: 'https://github.com/devhub/devhub-cms-mcp',
  env: {
    DEVHUB_API_KEY: {
      label: 'DEVHUB_API_KEY',
      placeholder: 'YOUR_KEY_HERE',
      required: true,
    },
    DEVHUB_API_SECRET: {
      label: 'DEVHUB_API_SECRET',
      placeholder: 'YOUR_SECRET_HERE',
      required: true,
    },
  },
}

export default DEVHUB_CMS_MCP_CONFIG
