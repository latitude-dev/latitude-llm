import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Slack channel management and messaging capabilities.',
  command: npxCommand({ package: '@modelcontextprotocol/server-slack' }),
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
  envSource: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack#setup',
} as HostedIntegrationConfig
