import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

export default {
  description:
    'A set of tools to inspect error reports, stacktraces, and other debugging information from your Sentry account.',
  command: uvxCommand({ name: 'mcp-server-sentry' }),
  env: {
    SENTRY_TOKEN: {
      label: 'Sentry Token',
      description: 'The token for the Sentry API',
      placeholder: 'your-sentry-token',
      required: true,
    },
  },
} as HostedIntegrationConfig
