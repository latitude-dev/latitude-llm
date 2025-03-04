import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

const env = {
  DB_HOST: {
    label: 'Host',
    description: 'The host of the PostgreSQL database',
    placeholder: 'custom.host.com',
    required: true,
  },
  DB_PORT: {
    label: 'Port',
    description: 'The port of the PostgreSQL database',
    placeholder: '1234',
    required: true,
  },
  DB_USERNAME: {
    label: 'Username',
    description: 'The username for the PostgreSQL database',
    placeholder: 'username',
    required: true,
  },
  DB_PASSWORD: {
    label: 'Password',
    description: 'The password for the PostgreSQL database',
    placeholder: '******',
    required: true,
  },
}

export default {
  description:
    'Provides read-only access to PostgreSQL databases. This integration enables LLMs to inspect database schemas and execute read-only queries.',
  env,
  commandFn: ({ DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD }) => {
    const endpoint = `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}`
    return npxCommand({
      package: '@modelcontextprotocol/server-puppeteer',
      args: endpoint,
    })
  },
} as HostedIntegrationConfig<typeof env>
