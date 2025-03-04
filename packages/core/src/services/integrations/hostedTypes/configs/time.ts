import { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

export default {
  description:
    'This integration enables LLMs to get current time information and perform timezone conversions using IANA timezone names, with automatic system timezone detection.',
  command: uvxCommand({ name: 'mcp-server-time' }),
  env: {},
} as HostedIntegrationConfig
