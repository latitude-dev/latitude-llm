import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'
const QDRANT_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'mcp-server-qdrant',
  }),
  envSource: 'https://github.com/qdrant/mcp-server-qdrant/',
  env: {
    QDRANT_URL: {
      label: 'QDRANT_URL',
      placeholder: 'http://localhost:6333',
      required: true,
    },
    COLLECTION_NAME: {
      label: 'COLLECTION_NAME',
      placeholder: 'my-collection',
      required: true,
    },
  },
}

export default QDRANT_MCP_CONFIG
