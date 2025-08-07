import type { HostedIntegrationConfig } from '../types'
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
  envSource:
    'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
} as HostedIntegrationConfig
