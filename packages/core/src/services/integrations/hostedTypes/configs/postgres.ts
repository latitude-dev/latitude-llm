import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'This integration enables read only access to a Postgres/Supabase database.',
  command: npxCommand({
    package: '@modelcontextprotocol/server-postgres',
    args: '$DATABASE_URL',
  }),
  env: {
    DATABASE_URL: {
      label: 'Postgres/Supabase URL',
      description: 'The URL of your Postgres/Supabase database',
      placeholder: 'postgresql://user:password@host:port/database',
      required: true,
    },
  },
} as HostedIntegrationConfig
