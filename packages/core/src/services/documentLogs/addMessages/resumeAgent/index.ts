import { LogSources, Workspace, ProviderLog } from '../../../../browser'
import { Result } from '../../../../lib'
import { buildProvidersMap } from '../../../providerApiKeys/buildMap'
import {
  ContentType,
  Conversation,
  Message,
  MessageRole,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  ChainStepResponse,
  ErrorableEntity,
  StreamType,
} from '../../../../constants'
import { ChainEvent } from '@latitude-data/constants'
import { runAgentStep } from '../../../agents/runStep'
import { ChainResponse } from '../addChatMessage'
import { buildProviderLogResponse } from '../../../providerLogs'
import {
  ChainError,
  createChainRunError,
} from '../../../../lib/streamManager/ChainErrors'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { FinishReason } from 'ai'

function buildExtraMessages({
  providerLog,
  newMessages,
}: {
  providerLog: ProviderLog
  newMessages: Message[]
}) {
  const agentFinishToolCalls =
    providerLog.toolCalls?.filter(
      (toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME,
    ) ?? []

  if (!agentFinishToolCalls.length) {
    return newMessages
  }

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

  return [...agentToolCallResponseMessages, ...newMessages]
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
  messages,
  source,
}: {
  workspace: Workspace
  providerLog: ProviderLog
  messages: Message[]
  source: LogSources
}) {
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })

  const previousResponse: ChainStepResponse<StreamType> = {
    text: buildProviderLogResponse(providerLog),
    usage: {
      completionTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
    },
    finishReason: (providerLog.finishReason as FinishReason) ?? 'tool-calls',
    chainCompleted: false,
    documentLogUuid: providerLog.documentLogUuid!,
    providerLog,
    streamType: providerLog.responseObject ? 'object' : 'text',
    toolCalls: providerLog.toolCalls,
    object: providerLog.responseObject,
  }

  const previousMessages = providerLog.messages
  const extraMessages = buildExtraMessages({
    providerLog,
    newMessages: messages,
  })
  const conversation: Conversation = {
    config: providerLog.config!,
    messages: previousMessages,
  }

  let responseResolve: (value: ChainResponse<StreamType>) => void

  const response = new Promise<ChainResponse<StreamType>>((resolve) => {
    responseResolve = resolve
  })

  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      runAgentStep({
        controller,
        workspace,
        source,
        conversation,
        providersMap,
        previousCount: previousMessages.length,
        previousResponse,
        errorableUuid: providerLog.documentLogUuid!,
        stepCount: 0,
        extraMessages,
      })
        .then((res) => {
          responseResolve(Result.ok(res))
        })
        .catch(async (e: ChainError<RunErrorCodes>) => {
          const error = await createChainRunError({
            error: e,
            errorableUuid: providerLog.documentLogUuid!,
            errorableType: ErrorableEntity.DocumentLog,
            persistErrors: true,
          })

          responseResolve(Result.error(error))
        })
    },
  })

  return Result.ok({ stream, response })
}
