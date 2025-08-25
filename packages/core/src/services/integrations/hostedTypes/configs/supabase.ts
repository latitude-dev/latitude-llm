import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'This integration enables read only access to a Supabase database.',
  command: npxCommand({
    package: '@supabase/mcp-server-supabase@latest',
    args: '--access-token $SUPABASE_ACCESS_TOKEN',
  }),
  env: {
    SUPABASE_ACCESS_TOKEN: {
      label: 'Supabase Access Token',
      description: 'The access token for your Supabase project',
      placeholder: 'your-access-token',
      required: true,
    },
  },
  envSource: 'https://supabase.com/docs/guides/getting-started/mcp',
} as HostedIntegrationConfig
