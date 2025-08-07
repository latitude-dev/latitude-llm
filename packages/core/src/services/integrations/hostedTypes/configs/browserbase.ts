import type { HostedIntegrationConfig } from '../types'

export default {
  description: 'Integrates the Browserbase API, a headless web browser.',
  command: 'node mcps/mcp-server-browserbase/browserbase/dist/index.js',
  env: {
    BROWSERBASE_PROJECT_ID: {
      label: 'Browserbase Project ID',
      description: 'The Project ID for the Browserbase API',
      placeholder: 'your-project-id',
      required: true,
    },
    BROWSERBASE_API_KEY: {
      label: 'Browserbase API Key',
      description: 'The API key for the Browserbase API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource: 'https://docs.browserbase.com/introduction/getting-started#overview-dashboard',
} as HostedIntegrationConfig
