import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const VECTORIZE_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@vectorize-io/vectorize-mcp-server@latest',
  }),
  envSource: 'https://github.com/vectorize-io/vectorize-mcp-server',
  env: {
    VECTORIZE_ORG_ID: {
      label: 'VECTORIZE_ORG_ID',
      placeholder: 'YOUR_ORG_ID',
      required: true,
    },
    VECTORIZE_TOKEN: {
      label: 'VECTORIZE_TOKEN',
      placeholder: 'YOUR_TOKEN',
      required: true,
    },
    VECTORIZE_PIPELINE_ID: {
      label: 'VECTORIZE_PIPELINE_ID',
      placeholder: 'YOUR_PIPELINE_ID',
      required: true,
    },
  },
}

export default VECTORIZE_MCP_CONFIG
