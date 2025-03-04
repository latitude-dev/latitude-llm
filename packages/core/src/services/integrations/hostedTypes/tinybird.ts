import { HostedIntegrationConfig } from './types'

export default {
  description: `A bridge between the Telegram API and AI assistants, providing read-only access to Telegram data like dialogs and messages.`,
  command:
    'uvx --from git+https://github.com/tinybirdco/mcp-tinybird mcp-tinybird stdio',
  env: {
    TB_API_URL: {
      label: 'Tinybird API URL',
      description: 'Your Tinybird API URL',
      placeholder: '<your-tinybird-api-url>',
      required: true,
    },
    TB_ADMIN_TOKEN: {
      label: 'Tinybird Admin Token',
      description: 'Your Tinybird Admin Token',
      placeholder: '<your-tinybird-admin-token>',
      required: true,
    },
  },
} as HostedIntegrationConfig
