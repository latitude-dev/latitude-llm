import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Enables LLMs to interact with web pages, take screenshots, and execute JavaScript in a real browser environment using Puppeteer.',
  commandFn: () =>
    npxCommand({ package: '@modelcontextprotocol/server-puppeteer' }),
  env: {},
} as HostedIntegrationConfig
