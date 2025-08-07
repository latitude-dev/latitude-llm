import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const LARA_TRANSLATE_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: '@translated/lara-mcp',
    args: '@latest',
  }),
  envSource: 'https://github.com/translated/lara-mcp',
  env: {
    LARA_ACCESS_KEY_ID: {
      label: 'LARA_ACCESS_KEY_ID',
      placeholder: '<YOUR_ACCESS_KEY_ID>',
      required: true,
    },
    LARA_ACCESS_KEY_SECRET: {
      label: 'LARA_ACCESS_KEY_SECRET',
      placeholder: '<YOUR_ACCESS_KEY_SECRET>',
      required: true,
    },
  },
}

export default LARA_TRANSLATE_MCP_CONFIG
