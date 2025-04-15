import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const FIRECRAWL_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'firecrawl-mcp',
  }),
  envSource: 'https://github.com/mendableai/firecrawl-mcp-server',
  env: {
    FIRECRAWL_API_KEY: {
      label: 'FIRECRAWL_API_KEY',
      placeholder: 'fc-YOUR_API_KEY',
      required: true,
    },
  },
}

export default FIRECRAWL_MCP_CONFIG
