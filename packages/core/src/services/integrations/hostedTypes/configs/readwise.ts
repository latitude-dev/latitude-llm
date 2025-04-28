import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Readwise makes it easy to revisit and learn from your ebook & article highlights.',
  command: npxCommand({ package: '@readwise/readwise-mcp' }),
  env: {
    ACCESS_TOKEN: {
      label: 'Readwise Access Token',
      description: 'The token for the Readwise API',
      placeholder: 'secret_xxx',
      required: true,
    },
  },
  envSource: 'https://readwise.io/accounts/login/?next=/access_token',
} as HostedIntegrationConfig
