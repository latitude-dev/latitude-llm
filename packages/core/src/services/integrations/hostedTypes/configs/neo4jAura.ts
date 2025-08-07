import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const NEO4J_AURA_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'mcp-neo4j-cypher',
    args: '==0.1.2',
  }),
  envSource: 'https://github.com/neo4j-contrib/mcp-neo4j/',
  env: {
    NEO4J_URL: {
      label: 'NEO4J_URL',
      placeholder: 'bolt://localhost:7687',
      required: true,
    },
    NEO4J_USERNAME: {
      label: 'NEO4J_USERNAME',
      placeholder: 'neo4j',
      required: true,
    },
    NEO4J_PASSWORD: {
      label: 'NEO4J_PASSWORD',
      placeholder: '<your-password>',
      required: true,
    },
  },
}

export default NEO4J_AURA_MCP_CONFIG
