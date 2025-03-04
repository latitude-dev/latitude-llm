import { HostedIntegrationConfig } from './types'
import { npxCommand } from './utils'

export default {
  description: 'Tools to interact with the Stripe API.',
  command: npxCommand({ package: '@stripe/mcp', args: '--tools=all' }),
  env: {
    STRIPE_SECRET_KEY: {
      label: 'Stripe API Key',
      description: 'Your secret key for the Stripe API',
      required: true,
    },
  },
} as HostedIntegrationConfig
