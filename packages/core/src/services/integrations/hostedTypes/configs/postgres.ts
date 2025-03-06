import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'This integration enables read only access to a Postgres database.',
  command: npxCommand({
    package: '@modelcontextprotocol/server-postgres',
    args: '$POSTGRES_URL',
  }),
  env: {
    POSTGRES_URL: {
      label: 'Postgres URL',
      description: 'The URL of your Postgres database',
      placeholder: 'postgresql://user:password@host:port/database',
      required: true,
    },
  },
} as HostedIntegrationConfig
