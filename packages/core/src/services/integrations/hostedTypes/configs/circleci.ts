import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const CIRCLECI_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@circleci/mcp-server-circleci',
  }),
  envSource: 'https://github.com/CircleCI-Public/mcp-server-circleci',
  env: {
    CIRCLECI_TOKEN: {
      label: 'CIRCLECI_TOKEN',
      placeholder: 'your-circleci-token',
      required: true,
    },
  },
}

export default CIRCLECI_MCP_CONFIG
