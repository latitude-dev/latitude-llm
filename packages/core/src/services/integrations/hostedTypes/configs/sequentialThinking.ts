import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'A set of tool for dynamic and reflective problem-solving through a structured thinking process.',
  command: npxCommand({
    package: '@modelcontextprotocol/server-sequential-thinking',
  }),
  env: {},
} as HostedIntegrationConfig
