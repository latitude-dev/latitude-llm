import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Interact with Twitter through your AI, enabling posting tweets and searching Twitter.',
  command: npxCommand({ package: '@enescinar/twitter-mcp' }),
  env: {
    API_KEY: {
      label: 'API Key',
      required: true,
    },
    API_SECRET_KEY: {
      label: 'API Secret Key',
      required: true,
    },
    ACCESS_TOKEN: {
      label: 'Access Token',
      required: true,
    },
    ACCESS_TOKEN_SECRET: {
      label: 'Access Token Secret',
      required: true,
    },
  },
  envSource:
    'https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/api-key-and-secret#how-to-acquire-an-api-key-and-secret',
} as HostedIntegrationConfig
