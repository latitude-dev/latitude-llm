import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const SUPABASE_LINGO_MCP_CONFIG: HostedIntegrationConfig = {
  command: npxCommand({
    package: 'lingo.dev',
    args: 'mcp $LINGO_API_KEY',
  }),
  envSource: 'https://github.com/lingo-dev/lingo-mcp',
  env: {
    LINGO_API_KEY: {
      label: 'LINGO_API_KEY',
      placeholder: 'your-api-key-here',
      required: true,
    },
  },
}

export default SUPABASE_LINGO_MCP_CONFIG
