import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Tools for the GitHub API, enabling file operations, repository management, search functionality, and more.',
  command: npxCommand({ package: '@modelcontextprotocol/server-github' }),
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: {
      label: 'Access Token',
      description: 'Your personal access token',
      required: true,
    },
  },
} as HostedIntegrationConfig
