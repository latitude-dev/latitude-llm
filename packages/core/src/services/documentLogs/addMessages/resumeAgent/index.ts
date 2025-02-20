import { LogSources, Workspace, ProviderLog } from '../../../../browser'
import { Result } from '../../../../lib'
import { buildProvidersMap } from '../../../providerApiKeys/buildMap'
import {
  AssistantMessage,
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  ToolMessage,
  ToolRequestContent,
} from '@latitude-data/compiler'
import { AGENT_RETURN_TOOL_NAME, PromptSource } from '../../../../constants'
import { runAgentStep } from '../../../agents/runStep'
import { ChainStreamManager } from '../../../../lib/chainStreamManager'

function buildAssistantMessage(providerLog: ProviderLog): AssistantMessage {
  const toolContents: ToolRequestContent[] = providerLog.toolCalls.map(
    (toolCall) => ({
      type: ContentType.toolCall,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    }),
  )

  const textContents = providerLog.responseText
    ? [{ type: ContentType.text, text: providerLog.responseText }]
    : []

  return {
    role: MessageRole.assistant,
    content: [...textContents, ...toolContents] as MessageContent[],
    toolCalls: providerLog.toolCalls,
  }
}

function buildExtraMessages({
  providerLog,
  newMessages,
}: {
  providerLog: ProviderLog
  newMessages: Message[]
}) {
  const assistantMessage = buildAssistantMessage(providerLog)
  const agentFinishToolCalls =
    providerLog.toolCalls?.filter(
      (toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME,
    ) ?? []

  const agentToolCallResponseMessages: ToolMessage[] = agentFinishToolCalls.map(
    (toolCall) => ({
      role: MessageRole.tool,
      content: [
        {
          type: ContentType.toolResult,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: {},
          isError: false,
        },
      ],
    }),
  )

  return [assistantMessage, ...agentToolCallResponseMessages, ...newMessages]
}

/**
 * Resume agent
 * ::::::::::::::::::::
 * Adds an additional message to an agent conversation, either paused or
 * completed, and starts an autonomous workflow from that point.
 */
export async function resumeAgent({
  workspace,
  providerLog,
  messages: userProvidedMessags,
  source,
  promptSource,
}: {
  workspace: Workspace
  providerLog: ProviderLog
  messages: Message[]
  source: LogSources
  promptSource: PromptSource
}) {
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })

  const newMessages = buildExtraMessages({
    providerLog,
    newMessages: userProvidedMessags,
  })

  const chainStreamManager = new ChainStreamManager({
    workspace,
    errorableUuid: providerLog.documentLogUuid!,
    messages: [...providerLog.messages, ...newMessages],
    promptSource,
    // TODO: Missing previous TokenUsage
  })

  const streamResult = chainStreamManager.start(async () => {
    await runAgentStep({
      chainStreamManager,
      workspace,
      source,
      conversation: {
        config: providerLog.config!,
        messages: providerLog.messages,
      },
      providersMap,
      errorableUuid: providerLog.documentLogUuid!,
      stepCount: 0,
      newMessages,
    })
  })

  return Result.ok(streamResult)
}
