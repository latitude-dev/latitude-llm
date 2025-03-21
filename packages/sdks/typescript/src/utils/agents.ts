import { AGENT_RETURN_TOOL_NAME } from '@latitude-data/constants'
import { Config } from 'promptl-ai'

export function injectAgentFinishTool(config: Config) {
  const { schema, tools, ...rest } = config

  const toolSchema = schema ?? {
    type: 'object',
    properties: {
      response: {
        type: 'string',
        description:
          'The final output or answer to the user or calling system.',
      },
    },
    required: ['response'],
  }

  return {
    ...rest,
    tools: {
      ...(tools ?? {}),
      [AGENT_RETURN_TOOL_NAME]: {
        description:
          'This tool acts as the final step in your agentic workflow, used to return the final output or answer to the user or calling system. Until this tool is called, you are part of an autonomous workflow, generating infinite messages in a loop.',
        parameters: toolSchema,
      },
    },
  }
}
