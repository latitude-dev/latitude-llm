import { LogSources, Workspace, ProviderLog } from '../../../../browser'
import { Result } from '../../../../lib'
import { buildProvidersMap } from '../../../providerApiKeys/buildMap'
import {
  AssistantMessage,
  Config,
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  ToolRequestContent,
} from '@latitude-data/compiler'
import { PromptSource } from '../../../../constants'
import { runAgentStep } from '../../../agents/runStep'
import { ChainStreamManager } from '../../../../lib/chainStreamManager'
import { PromptConfig } from '@latitude-data/constants'

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

/**
 * Resume agent
 * ::::::::::::::::::::
 * Adds an additional message to an agent conversation, either paused or
 * completed, and starts an autonomous workflow from that point.
 */
export async function resumeAgent({
  workspace,
  providerLog,
  globalConfig,
  messages: userProvidedMessags,
  source,
  promptSource,
}: {
  workspace: Workspace
  providerLog: ProviderLog
  globalConfig: PromptConfig
  messages: Message[]
  source: LogSources
  promptSource: PromptSource
}) {
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })

  const newMessages = [
    buildAssistantMessage(providerLog),
    ...userProvidedMessags,
  ]

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
      globalConfig,
      conversation: {
        config: globalConfig,
        messages: providerLog.messages,
      },
      providersMap,
      errorableUuid: providerLog.documentLogUuid!,
      stepCount: 0,
      newMessages,
      previousConfig: providerLog.config as Config,
    })
  })

  return Result.ok(streamResult)
}
