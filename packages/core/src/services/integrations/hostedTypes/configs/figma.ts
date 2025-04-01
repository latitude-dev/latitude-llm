import { npxCommand } from '../utils'

export default {
  description: 'Integration for interacting with Figma',
  command: npxCommand({
    package: 'figma-developer-mcp',
    args: '--figma-api-key=$FIGMA_API_KEY --stdio',
  }),
  env: {
    FIGMA_API_KEY: {
      label: 'Figma API Key',
      description: 'The API key for the Figma API',
      placeholder: 'your-api-key',
      required: true,
    },
  },
  envSource:
    'https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens',
}
