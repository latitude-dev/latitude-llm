import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const ASTRADB_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@datastax/astra-db-mcp',
  }),
  envSource: 'https://github.com/datastax/astra-db-mcp',
  env: {
    ASTRA_DB_APPLICATION_TOKEN: {
      label: 'ASTRA_DB_APPLICATION_TOKEN',
      placeholder: 'your_astra_db_token',
      required: true,
    },
    ASTRA_DB_API_ENDPOINT: {
      label: 'ASTRA_DB_API_ENDPOINT',
      placeholder: 'your_astra_db_endpoint',
      required: true,
    },
  },
}

export default ASTRADB_MCP_CONFIG
