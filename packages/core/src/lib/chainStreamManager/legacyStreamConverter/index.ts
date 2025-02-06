import {
  ChainStepResponse,
  Config,
  LegacyChainEvent,
  LegacyChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/constants'
import { ChainEvent, ChainEventTypes } from '../events'
import { StreamType } from '../../../constants'
import {
  ContentType,
  Message,
  MessageRole,
  ToolCall,
} from '@latitude-data/compiler'

function getAssistantMessageToolCallIds(message?: Message): unknown[] {
  if (message?.role !== 'assistant') return []
  if (message.toolCalls) {
    const toolCalls: ToolCall[] = message.toolCalls
    return toolCalls.map((toolCall) => toolCall.id)
  }

  if (!Array.isArray(message.content)) return []
  return message.content
    .filter((c) => c.type === ContentType.toolCall)
    .map((t) => t.toolCallId)
}

export function convertToLegacyChainStream(
  stream: ReadableStream<ChainEvent>,
): {
  stream: ReadableStream<LegacyChainEvent>
  response: Promise<ChainStepResponse<StreamType>>
} {
  let resolveResponse: (response: ChainStepResponse<StreamType>) => void
  const response = new Promise<ChainStepResponse<StreamType>>((resolve) => {
    resolveResponse = resolve
  })

  let lastResponse: ChainStepResponse<StreamType>
  let lastConfig: Config
  let messageCount = 0
  let isResumingPausedChain = false

  const legacyStream = new ReadableStream<LegacyChainEvent>({
    start: async (controller) => {
      const eventsReader = stream.getReader()
      while (true) {
        const { done, value } = await eventsReader.read()
        if (done) break

        if (value.event === StreamEventTypes.Provider) {
          controller.enqueue(value)
          continue
        }

        const { data } = value
        if (data.type === ChainEventTypes.ChainStarted) {
          if (data.messages.length) isResumingPausedChain = true
          messageCount = data.messages.length
        }

        if (data.type === ChainEventTypes.ProviderStarted) {
          if (isResumingPausedChain) {
            // If the chain is being resumed, the first additional message should be an assistant
            // response, followed by tool responses, and then the additional step messages. Only
            // the additional messages should be enqueued.
            const stepMessages = data.messages.slice(messageCount)
            const assistantMessage = stepMessages.shift()
            const toolCallIds = getAssistantMessageToolCallIds(assistantMessage)
            messageCount +=
              stepMessages.filter(
                (m) =>
                  m.role === MessageRole.tool &&
                  m.content.some((c) => toolCallIds.includes(c.toolCallId)),
              ).length + 1

            isResumingPausedChain = false
          }

          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: LegacyChainEventTypes.Step,
              documentLogUuid: data.documentLogUuid,
              messages: data.messages.slice(messageCount),
              isLastStep: false,
              config: data.config as Config,
            },
          })

          messageCount = data.messages.length
          lastConfig = data.config as Config
          continue
        }

        if (data.type === ChainEventTypes.ProviderCompleted) {
          lastResponse = data.response
          continue
        }

        if (data.type === ChainEventTypes.StepCompleted) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: LegacyChainEventTypes.StepComplete,
              documentLogUuid: data.documentLogUuid,
              response: lastResponse,
            },
          })
          messageCount = data.messages.length
          continue
        }

        if (data.type === ChainEventTypes.ChainCompleted) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: LegacyChainEventTypes.Complete,
              documentLogUuid: data.documentLogUuid,
              config: lastConfig,
              messages: data.messages,
              response: lastResponse,
              finishReason: data.finishReason,
            },
          })
          resolveResponse(lastResponse)
          break
        }

        if (data.type === ChainEventTypes.ToolsRequested) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: LegacyChainEventTypes.Complete,
              documentLogUuid: data.documentLogUuid,
              config: lastConfig,
              messages: data.messages,
              response: {
                ...lastResponse,
                toolCalls: data.tools,
              } as ChainStepResponse<StreamType>,
              finishReason: 'tool-calls',
            },
          })
        }

        if (data.type === ChainEventTypes.ChainError) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: LegacyChainEventTypes.Error,
              error: await data.error,
            },
          })
          break
        }
      }

      controller.close()
    },
  })

  return {
    stream: legacyStream,
    response,
  }
}
