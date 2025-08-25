import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const GRAPHLIT_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'graphlit-mcp-server',
  }),
  envSource: 'https://github.com/graphlit/graphlit-mcp-server',
  env: {
    GRAPHLIT_ORGANIZATION_ID: {
      label: 'GRAPHLIT_ORGANIZATION_ID',
      placeholder: 'your-organization-id',
      required: true,
    },
    GRAPHLIT_ENVIRONMENT_ID: {
      label: 'GRAPHLIT_ENVIRONMENT_ID',
      placeholder: 'your-environment-id',
      required: true,
    },
    GRAPHLIT_JWT_SECRET: {
      label: 'GRAPHLIT_JWT_SECRET',
      placeholder: 'your-jwt-secret',
      required: true,
    },
  },
}

export default GRAPHLIT_MCP_CONFIG
