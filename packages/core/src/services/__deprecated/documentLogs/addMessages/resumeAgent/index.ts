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
import {
  LogSources,
  ProviderLog,
  TraceContext,
  Workspace,
} from '../../../../../browser'
import { PromptSource } from '../../../../../constants'
import { ChainStreamManager } from '../../../../../__deprecated/lib/chainStreamManager'
import { TelemetryContext } from '../../../../../telemetry'
import { runAgentStep } from '../../../agents/runStep'
import { buildProvidersMap } from '../../../../providerApiKeys/buildMap'
import { Result } from './../../../../../lib/Result'

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
  context,
  workspace,
  providerLog,
  globalConfig,
  messages: userProvidedMessags,
  source,
  promptSource,
  abortSignal,
}: {
  context: TelemetryContext
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

  let resolveTrace: (trace: TraceContext) => void
  const trace = new Promise<TraceContext>((resolve) => {
    resolveTrace = resolve
  })

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
      context,
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

    resolveTrace(result.trace)

    return result
  }, abortSignal)

  return Result.ok({ ...streamResult, trace })
}
