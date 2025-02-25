import {
  AssistantMessage,
  ContentType,
  Message,
  MessageRole,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  FAKE_AGENT_START_TOOL_NAME,
  VercelConfig,
} from '@latitude-data/constants'
import { LatitudeError, Result, TypedResult } from '../../lib'
import { JSONSchema7 } from 'json-schema'

export const AGENT_RETURN_TOOL_DESCRIPTION = `
The '${FAKE_AGENT_START_TOOL_NAME}' tool is used to start an autonomous chain-of-thought workflow.
Within this workflow, you will generate messages autonomously.
All of the Assistant messages within this workflow will be internal, used as a chain-of-thought and to execute tools in order to achieve your task. The user will not read these messages.
Use this tool to stop the autonomous workflow and return a message to the user. It must contain the final result of the workflow.
`.trim()

const FAKE_AGENT_START_TOOL_CONTENT = `
  Autonomous workflow started.
  All messages from now on are for internal use only and will not be presented to the user.
  Use this workflow to perform a chain-of-thought about your task and execute required tools.
  You must explain your thought process on each and every step of the chain.
  Start by understanding your task and explaining the intended course of actions to yourself.
  Once you have finished your current task, use the '${AGENT_RETURN_TOOL_NAME}' tool to finish it. The tool call must include the requested result.
`.trim()

const DEFAULT_AGENT_RETURN_TOOL_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    response: {
      type: 'string',
    },
  },
  required: ['response'],
}

/**
 * Injects fake assistant messages used to request the start of an autonomous workflow.
 * These messages greatly help the AI understand they are in an autonomous workflow and how it works.
 */
function injectFakeStartAutonomousWorkflowMessages(
  messages: Message[],
): Message[] {
  let wokflowCount = 1
  const createFakeStartTool = (): [AssistantMessage, ToolMessage] => {
    const toolId = `agent_start_${wokflowCount++}`
    const toolName = FAKE_AGENT_START_TOOL_NAME

    return [
      {
        role: MessageRole.assistant,
        content: [
          {
            type: ContentType.toolCall,
            toolCallId: toolId,
            toolName,
            args: {},
          },
        ],
        toolCalls: [
          {
            id: toolId,
            name: toolName,
            arguments: {},
          },
        ],
      },
      {
        role: MessageRole.tool,
        content: [
          {
            type: ContentType.toolResult,
            toolCallId: toolId,
            toolName,
            result: FAKE_AGENT_START_TOOL_CONTENT,
            isError: false,
          },
        ],
      },
    ]
  }

  // Messages are injected in these cases:
  // - Before starting the first workflow (before the first assistant message after the initial instructions)
  // - Before starting a new workflow (after the user chat message added after the previous workflow was stopped)
  let inAutonomousMode = false
  const newMessages = messages.reduce((acc: Message[], message, index) => {
    const isLast = index === messages.length - 1
    const isAgentReturnTool =
      message.role === MessageRole.assistant &&
      message.toolCalls.some(
        (toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME,
      )

    if (!inAutonomousMode && message.role === MessageRole.assistant) {
      inAutonomousMode = true
      return [...acc, ...createFakeStartTool(), message]
    }

    if (isLast && !inAutonomousMode) {
      return [...acc, message, ...createFakeStartTool()]
    }

    if (inAutonomousMode && isAgentReturnTool) {
      inAutonomousMode = false
      return [...acc, message]
    }

    return [...acc, message]
  }, [])

  return newMessages
}

export function performAgentInjection({
  messages: originalMessages,
  config: originalConfig,
  injectFakeAgentStartTool,
  injectAgentFinishTool,
}: {
  messages: Message[]
  config: VercelConfig
  injectFakeAgentStartTool?: boolean
  injectAgentFinishTool?: boolean
}): TypedResult<{ messages: Message[]; config: VercelConfig }, LatitudeError> {
  let config = originalConfig
  let messages = originalMessages

  if (injectFakeAgentStartTool) {
    messages = injectFakeStartAutonomousWorkflowMessages(messages)
  }

  if (injectAgentFinishTool) {
    const { schema, ...rest } = config
    config = {
      ...rest,
      tools: {
        ...(rest.tools ?? {}),
        [AGENT_RETURN_TOOL_NAME]: {
          description: AGENT_RETURN_TOOL_DESCRIPTION,
          parameters: schema ?? DEFAULT_AGENT_RETURN_TOOL_SCHEMA,
        },
      },
    }
  }

  return Result.ok({
    messages,
    config,
  })
}
