import { HostedIntegrationConfig } from './types'

export default {
  description: `A bridge between the Telegram API and AI assistants, providing read-only access to Telegram data like dialogs and messages.`,
  command:
    'uvx --from git+https://github.com/sparfenyuk/mcp-telegram mcp-telegram',
  env: {
    TELEGRAM_API_ID: {
      label: 'Telegram API ID',
      description: 'The API ID for the Telegram bot',
      placeholder: '1234567',
      required: true,
    },
    TELEGRAM_API_HASH: {
      label: 'Telegram API Hash',
      description: 'The API Hash for the Telegram bot',
      placeholder: 'your-api-hash',
      required: true,
    },
  },
} as HostedIntegrationConfig
