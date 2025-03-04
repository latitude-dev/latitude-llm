import { HostedIntegrationConfig } from './types'

export default {
  description:
    'Tools for the GitHub API, enabling file operations, repository management, search functionality, and more.',
  command: 'npx -y @modelcontextprotocol/server-github',
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: {
      label: 'Access Token',
      description: 'Your personal access token',
      required: true,
    },
  },
} as HostedIntegrationConfig
