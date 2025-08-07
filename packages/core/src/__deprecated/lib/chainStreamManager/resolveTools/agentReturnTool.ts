import {
  AGENT_RETURN_TOOL_NAME,
  FAKE_AGENT_START_TOOL_NAME,
  ToolDefinition,
} from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { JSONSchema7 } from 'json-schema'
import { LatitudeError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import { ResolvedTools, ToolSource } from './types'

const AGENT_RETURN_TOOL_DESCRIPTION = `
The '${FAKE_AGENT_START_TOOL_NAME}' tool is used to start an autonomous chain-of-thought workflow.
Within this workflow, you will generate messages autonomously.
All of the Assistant messages within this workflow will be internal, used as a chain-of-thought and to execute tools in order to achieve your task. The user will not read these messages.
Use this tool to stop the autonomous workflow and return a message to the user. It must contain the final result of the workflow.
`.trim()

const DEFAULT_AGENT_RETURN_TOOL_SCHEMA: JSONSchema7 = {
  type: 'object',
  // NOTE: OpenAI reponses endpoint requires to declare `additionalProperties: false` in the schema
  additionalProperties: false,
  properties: {
    response: {
      type: 'string',
    },
  },
  required: ['response'],
}

export function resolveAgentReturnTool({
  config,
  injectAgentFinishTool,
}: {
  config: LatitudePromptConfig
  injectAgentFinishTool?: boolean
}): TypedResult<ResolvedTools, LatitudeError> {
  if (!injectAgentFinishTool) {
    return Result.ok({})
  }

  return Result.ok({
    [AGENT_RETURN_TOOL_NAME]: {
      definition: {
        description: AGENT_RETURN_TOOL_DESCRIPTION,
        parameters: config.schema ?? DEFAULT_AGENT_RETURN_TOOL_SCHEMA,
      } as ToolDefinition,
      sourceData: {
        source: ToolSource.AgentReturn,
      },
    },
  })
}
