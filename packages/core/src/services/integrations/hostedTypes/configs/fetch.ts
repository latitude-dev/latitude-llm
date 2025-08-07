import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

export default {
  description:
    'Enables LLMs to retrieve and process content from web pages, converting HTML to markdown for easier consumption.',
  command: uvxCommand({ name: 'mcp-server-fetch' }),
  env: {},
} as HostedIntegrationConfig
