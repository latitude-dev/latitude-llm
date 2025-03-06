import { npxCommand } from '../utils'

export default {
  description: 'Interact with Redis databases',
  command: npxCommand({
    package: '@gongrzhe/server-redis-mcp',
    args: '$REDIS_URL',
  }),
  env: {
    REDIS_URL: {
      label: 'Redis URL',
      description: 'The URL of your Redis instance',
      placeholder: 'redis://localhost:6379',
      required: true,
    },
  },
  envSource: 'https://id.atlassian.com/manage-profile/security/api-tokens',
}
