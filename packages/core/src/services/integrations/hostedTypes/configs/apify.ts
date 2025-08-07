import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Gives access to any actor available from your APIFY account.',
  command: npxCommand({
    package: '@apify/actors-mcp-server',
    args: '${ACTORS:+--actors "$ACTORS"}',
  }),
  env: {
    APIFY_TOKEN: {
      label: 'Personal API token',
      description: 'The token for your APIFY account',
      placeholder: 'your-apify-token',
      required: true,
    },
    ACTORS: {
      label: 'Actors',
      description: 'The list of actors to be used in the integration, separated by commas',
      placeholder: 'actor1,actor2,actor3',
      required: false,
    },
  },
  envSource: 'https://console.apify.com/settings/integrations',
} as HostedIntegrationConfig
