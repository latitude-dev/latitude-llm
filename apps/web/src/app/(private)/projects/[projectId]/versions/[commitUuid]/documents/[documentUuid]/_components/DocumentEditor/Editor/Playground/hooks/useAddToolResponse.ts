import { addMessagesAction } from '$/actions/sdk/addMessagesAction'
import {
  AssistantMessage,
  Message as ConversationMessage,
  MessageRole,
} from '@latitude-data/compiler'
import {
  ChainEventTypes,
  StreamEventTypes,
  ToolCallResponse,
} from '@latitude-data/constants'
import { buildResponseMessage } from '@latitude-data/core/browser'
import { OnToolCallActionArgs, ReactStateDispatch } from '@latitude-data/web-ui'
import { LanguageModelUsage } from 'ai'
import { readStreamableValue } from 'ai/rsc'
import { useCallback } from 'react'

function buildToolResponseMessages({
  toolCallResponses,
}: {
  toolCallResponses: ToolCallResponse[]
}) {
  return toolCallResponses
    .map((tool) => {
      return buildResponseMessage<'text'>({
        type: 'text',
        data: { text: tool.text, toolCallResponses: [tool] },
      })
    })
    .filter((m) => !!m)
}

export function useAddToolResponse({
  documentLogUuid,
  streaming,
}: {
  documentLogUuid: string | undefined
  streaming: {
    addMessageToConversation: (message: ConversationMessage) => void
    setResponseStream: ReactStateDispatch<string | undefined>
    setError: ReactStateDispatch<Error | undefined>
    setUsage: ReactStateDispatch<LanguageModelUsage | undefined>
  }
}) {
  const addToolResponse = useCallback(
    async ({ toolCallResponse }: OnToolCallActionArgs) => {
      if (!documentLogUuid) return // This should not happen
      if (!toolCallResponse) return // Ignore. User didn't fill the form

      streaming.setResponseStream('')
      let response = ''
      try {
        const { output } = await addMessagesAction({
          documentLogUuid,
          messages: buildToolResponseMessages({
            toolCallResponses: [toolCallResponse],
          }),
        })

        for await (const serverEvent of readStreamableValue(output)) {
          if (!serverEvent) continue

          const { event, data } = serverEvent

          switch (event) {
            case StreamEventTypes.Latitude: {
              if (data.type === ChainEventTypes.Error) {
                streaming.setError(new Error(data.error.message))
              } else if (data.type === ChainEventTypes.Complete) {
                streaming.addMessageToConversation({
                  role: MessageRole.assistant,
                  content: data.response.text,
                } as AssistantMessage)

                streaming.setUsage(data.response.usage)
                streaming.setResponseStream(undefined)
              }

              break
            }

            case StreamEventTypes.Provider: {
              if (data.type === 'text-delta') {
                response += data.textDelta
                streaming.setResponseStream(response)
              }
              break
            }
            default:
              break
          }
        }
      } catch (error) {
        streaming.setError(error as Error)
      } finally {
        streaming.setResponseStream(undefined)
      }
    },
    [
      streaming.addMessageToConversation,
      streaming.setError,
      streaming.setResponseStream,
      documentLogUuid,
    ],
  )

  const addToolResponseData = documentLogUuid
    ? {
        documentLogUuid,
        addToolResponse,
      }
    : undefined

  return { addToolResponseData }
}
