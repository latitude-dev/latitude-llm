import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description: 'Integration for searching Airbnb and get listing details.',
  command: npxCommand({ package: '@openbnb/mcp-server-airbnb' }),
} as HostedIntegrationConfig
