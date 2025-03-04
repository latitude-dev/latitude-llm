import { HostedIntegrationConfig } from './types'

export default {
  description: 'Slack channel management and messaging capabilities.',
  command: '@modelcontextprotocol/server-slack',
  env: {
    SLACK_BOT_TOKEN: {
      label: 'Slack Bot Token',
      description: 'The token for the Slack bot',
      placeholder: 'xoxb-your-bot-token',
      required: true,
    },
    SLACK_TEAM_ID: {
      label: 'Slack Team ID',
      description: 'The ID of the Slack team',
      placeholder: 'T01234567',
      required: true,
    },
  },
} as HostedIntegrationConfig
