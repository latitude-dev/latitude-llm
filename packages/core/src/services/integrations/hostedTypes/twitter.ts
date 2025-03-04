import { HostedIntegrationConfig } from './types'

export default {
  description:
    'Interact with Twitter through your AI, enabling posting tweets and searching Twitter.',
  command: 'npx -y @enescinar/twitter-mcp',
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
} as HostedIntegrationConfig
