import { uvxCommand } from '../utils'

export default {
  description: 'Interact with Jira issues and boards',
  command: uvxCommand({
    name: 'mcp-atlassian',
  }),
  env: {
    JIRA_URL: {
      label: 'Jira URL',
      description: 'The URL of your Jira instance',
      placeholder: 'https://your-jira-instance.com',
      required: true,
    },
    JIRA_USERNAME: {
      label: 'Jira Username',
      description: 'The username of your Jira account',
      placeholder: 'your-jira-username',
      required: true,
    },
    JIRA_API_TOKEN: {
      label: 'Jira API Token',
      description: 'The API token of your Jira account',
      placeholder: 'your-jira-api-token',
      required: true,
    },
  },
  envSource: 'https://id.atlassian.com/manage-profile/security/api-tokens',
}
