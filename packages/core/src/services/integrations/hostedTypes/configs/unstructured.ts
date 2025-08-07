import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const UNSTRUCTURED_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'uns_mcp',
  }),
  envSource: 'https://github.com/Unstructured-IO/unstructured-mcp',
  env: {
    UNSTRUCTURED_API_KEY: {
      label: 'UNSTRUCTURED_API_KEY',
      placeholder: '<your-key>',
      required: true,
    },
  },
}

export default UNSTRUCTURED_MCP_CONFIG
