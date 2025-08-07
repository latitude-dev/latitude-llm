import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Integration for interacting with Attio CRM',
  command: npxCommand({
    package: 'attio-mcp-server',
  }),
  env: {
    ATTIO_API_KEY: {
      label: 'Attio API Key',
      description: 'The API key for the Attio API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource: 'https://developers.attio.com/reference/get_v2-objects',
} as HostedIntegrationConfig
