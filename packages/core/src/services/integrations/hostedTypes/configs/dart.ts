import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const DART_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'dart-mcp-server',
  }),
  envSource: 'https://github.com/its-dart/dart-mcp-server',
  env: {
    DART_TOKEN: {
      label: 'DART_TOKEN',
      placeholder: 'dsa_...',
      required: true,
    },
  },
}

export default DART_MCP_CONFIG
