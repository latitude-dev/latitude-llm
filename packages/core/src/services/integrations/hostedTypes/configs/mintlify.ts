import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Enabled tools for any Mintlify-hosted Documentation.',
  command: npxCommand({ package: '@latitude-data/mintlify-mcp' }),
  env: {
    MINTLIFY_DOMAIN: {
      label: 'Mintlify Domain',
      description: 'The subdomain of your Mintlify workspace',
      placeholder: 'latitudellms',
      required: true,
    },
  },
} as HostedIntegrationConfig
