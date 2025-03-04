import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Integration for interacting with GitLab API, enabling project management, file operations, and more.',
  commandFn: () =>
    npxCommand({
      package: '@modelcontextprotocol/server-gitlab',
    }),
  env: {
    GITLAB_PERSONAL_ACCESS_TOKEN: {
      label: 'GitLab Personal Access Token',
      description: 'The personal access token for GitLab',
      placeholder: '<your-personal-access-token>',
      required: true,
    },
    GITLAB_API_URL: {
      label: 'Your custom GitLab API URL (optional)',
      description: 'For self-hosted GitLab instances.',
      placeholder: 'https://gitlab.com/api/v4',
      required: false,
    },
  },
} as HostedIntegrationConfig
