import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const ELASTICSEARCH_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@elastic/mcp-server-elasticsearch',
  }),
  envSource: 'https://github.com/elastic/mcp-server-elasticsearch',
  env: {
    ES_URL: {
      label: 'ES_URL',
      placeholder: 'your-elasticsearch-url',
      required: true,
    },
    ES_API_KEY: {
      label: 'ES_API_KEY',
      placeholder: 'your-api-key',
      required: true,
    },
  },
}

export default ELASTICSEARCH_MCP_CONFIG
