import {
  AssistantMessage,
  Config,
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  ToolRequestContent,
} from '@latitude-data/compiler'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ChainStreamManager } from '../../../../../__deprecated/lib/chainStreamManager'
import { LogSources, ProviderLog, Workspace } from '../../../../../browser'
import { PromptSource } from '../../../../../constants'
import { Result } from '../../../../../lib/Result'
import { buildProvidersMap } from '../../../../providerApiKeys/buildMap'
import { runAgentStep } from '../../../agents/runStep'

function buildAssistantMessage(providerLog: ProviderLog): AssistantMessage {
  const toolContents: ToolRequestContent[] = (providerLog.toolCalls ?? []).map(
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
    toolCalls: providerLog.toolCalls ?? [],
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
  abortSignal,
}: {
  workspace: Workspace
  providerLog: ProviderLog
  globalConfig: LatitudePromptConfig
  messages: Message[]
  source: LogSources
  promptSource: PromptSource
  abortSignal?: AbortSignal
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
    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    messages: [...providerLog.messages, ...newMessages],
    promptSource,
    // TODO: Missing previous TokenUsage because last raw response is not cached
  })

  const streamResult = chainStreamManager.start(async () => {
    const result = await runAgentStep({
      chainStreamManager,
      workspace,
      source,
      globalConfig,
      conversation: {
        config: globalConfig,
        // TODO(compiler): fix types
        // @ts-expect-error - TODO: fix types
        messages: providerLog.messages,
      },
      providersMap,
      errorableUuid: providerLog.documentLogUuid!,
      stepCount: 0,
      newMessages,
      previousConfig: providerLog.config as Config,
      abortSignal,
    })

    return result
  }, abortSignal)

  return Result.ok({ ...streamResult })
}
