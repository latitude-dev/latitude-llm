import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Integration for interacting with the Google Maps API, enabling geocoding, reverse geocoding, searching places and more.',
  commandFn: () =>
    npxCommand({
      package: '@modelcontextprotocol/server-google-maps',
    }),
  env: {
    GOOGLE_MAPS_API_KEY: {
      label: 'Google Maps API Key',
      description: 'The API key for the Google Maps API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
} as HostedIntegrationConfig
