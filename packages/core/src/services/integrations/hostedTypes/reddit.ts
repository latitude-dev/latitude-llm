import { HostedIntegrationConfig } from './types'

export default {
  description: `A set of tools for fetching and analyzing Reddit content, including hot threads, post details, and comments.`,
  command:
    'uvx --from "git+https://github.com/adhikasp/mcp-reddit.git" mcp-reddit',
} as HostedIntegrationConfig
