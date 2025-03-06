import { HostedIntegrationConfig } from '../types'

export default {
  description: 'Integrates with Neon, serverless postgres.',
  command: 'npx @neondatabase/mcp-server-neon start $NEON_API_KEY',
  env: {
    NEON_API_KEY: {
      label: 'Neon API Key',
      description: 'The API key for the Neon API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource: 'https://neon.tech/docs/manage/api-keys',
} as HostedIntegrationConfig
