import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

export default {
  description: `A set of tools for fetching and analyzing Reddit content, including hot threads, post details, and comments.`,
  command: uvxCommand({
    name: 'mcp-reddit',
    repository: 'https://github.com/adhikasp/mcp-reddit.git',
  }),
} as HostedIntegrationConfig
