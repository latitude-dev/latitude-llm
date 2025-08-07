import {
  type AssistantMessage,
  ContentType,
  type Message,
  MessageRole,
  type ToolMessage,
} from '@latitude-data/compiler'
import { AGENT_RETURN_TOOL_NAME, FAKE_AGENT_START_TOOL_NAME } from '@latitude-data/constants'

const FAKE_AGENT_START_TOOL_CONTENT = `
  Autonomous workflow started.
  All messages from now on are for internal use only and will not be presented to the user.
  Use this workflow to perform a chain-of-thought about your task and execute required tools.
  You must explain your thought process on each and every step of the chain.
  Start by understanding your task and explaining the intended course of actions to yourself.
  Once you have finished your current task, use the '${AGENT_RETURN_TOOL_NAME}' tool to finish it. The tool call must include the requested result.
`.trim()

/**
 * Injects fake assistant messages used to request the start of an autonomous workflow.
 * These messages greatly help the AI understand they are in an autonomous workflow and how it works.
 */
export function injectFakeStartAutonomousWorkflowMessages(messages: Message[]): Message[] {
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
      message.toolCalls?.some((toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME)

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

export function injectAgentFinishToolResponsesAfterEachRequest(messages: Message[]): Message[] {
  // @ts-expect-error - TODO(compiler): fix types
  return messages.flatMap((message, idx) => {
    if (message.role !== MessageRole.assistant) return [message]
    const agentToolCallIds = message.toolCalls
      .filter((toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME)
      .map((toolCall) => toolCall.id)

    const nextNonToolResponseIdx = messages.findIndex(
      (msg, j) => j > idx && msg.role !== MessageRole.tool,
    )
    const nextToolResponses = messages.slice(idx + 1, Math.max(nextNonToolResponseIdx, idx + 1))
    const nextToolResponsesIds = nextToolResponses
      .filter((msg) => msg.role === MessageRole.tool)
      .flatMap((msg) => msg.content)
      .filter(
        (content) =>
          content.type === ContentType.toolResult && content.toolCallId === AGENT_RETURN_TOOL_NAME,
      )
      .map((content) => content.toolCallId)

    const nonRespondedAgentToolCallIds = agentToolCallIds.filter(
      (toolCallId) => !nextToolResponsesIds.includes(toolCallId),
    )

    const toolResponses = nonRespondedAgentToolCallIds.map(
      (toolCallId) =>
        ({
          role: MessageRole.tool,
          content: [
            {
              type: ContentType.toolResult,
              toolCallId,
              toolName: AGENT_RETURN_TOOL_NAME,
              result: {},
              isError: false,
            },
          ],
        }) as ToolMessage,
    )
    return [message, ...toolResponses]
  })
}
