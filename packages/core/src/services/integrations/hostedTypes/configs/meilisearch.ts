import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const MEILISEARCH_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@modelcontextprotocol/inspector',
    args: 'python -m src.meilisearch_mcp',
  }),
  envSource: 'https://github.com/meilisearch/meilisearch-mcp',
  env: {},
}

export default MEILISEARCH_MCP_CONFIG
