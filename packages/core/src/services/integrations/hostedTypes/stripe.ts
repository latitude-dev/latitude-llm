import { HostedIntegrationConfig } from './types'

export default {
  description: 'Tools to interact with the Stripe API.',
  command: '@stripe/mcp --tools=all',
  env: {
    STRIPE_SECRET_KEY: {
      label: 'Stripe API Key',
      description: 'Your secret key for the Stripe API',
      required: true,
    },
  },
} as HostedIntegrationConfig
