import type { HostedIntegrationConfig } from '../types'
import { uvxCommand } from '../utils'

const CODELOGIC_MCP_CONFIG: HostedIntegrationConfig = {
  command: uvxCommand({
    name: 'codelogic-mcp-server@latest',
  }),
  envSource: 'https://github.com/CodeLogicIncEngineering/codelogic-mcp-server',
  env: {
    CODELOGIC_SERVER_HOST: {
      label: 'CODELOGIC_SERVER_HOST',
      placeholder: '<url to the server>',
      required: true,
    },
    CODELOGIC_USERNAME: {
      label: 'CODELOGIC_USERNAME',
      placeholder: '<my username>',
      required: true,
    },
    CODELOGIC_PASSWORD: {
      label: 'CODELOGIC_PASSWORD',
      placeholder: '<my password>',
      required: true,
    },
  },
}

export default CODELOGIC_MCP_CONFIG
