import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'A basic implementation of persistent memory using a local knowledge graph. This lets your AIs remember information about the user across chats.',
  command: npxCommand({ package: '@modelcontextprotocol/server-memory' }),
  env: {},
} as HostedIntegrationConfig
