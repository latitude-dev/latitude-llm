import { addSharedMessagesAction } from '$/actions/sdk/addSharedMessagesAction'
import {
  Message as ConversationMessage,
  MessageRole,
  ContentType,
} from '@latitude-data/compiler'
import {
  ChainEventTypes,
  PublishedDocument,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui'
import { useCallback } from 'react'
import { readStreamableValue } from 'ai/rsc'

export function useChat({
  shared,
  documentLogUuid,
  addMessageToConversation,
  setResponseStream,
  setError,
}: {
  shared: PublishedDocument
  documentLogUuid: string | undefined
  addMessageToConversation: (message: ConversationMessage) => void
  setResponseStream: ReactStateDispatch<string | undefined>
  setError: ReactStateDispatch<Error | undefined>
}) {
  const onChat = useCallback(
    async (input: string) => {
      if (!documentLogUuid) return // This should not happen

      const message: ConversationMessage = {
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: input }],
      }

      setResponseStream('')

      addMessageToConversation(message)

      let response = ''

      try {
        const { output } = await addSharedMessagesAction({
          publishedDocumentUuid: shared.uuid!,
          documentLogUuid,
          messages: [message],
        })

        for await (const serverEvent of readStreamableValue(output)) {
          if (!serverEvent) continue

          const { event, data } = serverEvent

          switch (event) {
            case StreamEventTypes.Latitude: {
              if (data.type === ChainEventTypes.Error) {
                setError(new Error(data.error.message))
              } else if (data.type === ChainEventTypes.Complete) {
                // @ts-expect-error - Something wrong with the types
                addMessageToConversation({
                  role: MessageRole.assistant,
                  content: data.response.text,
                })

                setResponseStream(undefined)
              }

              break
            }

            case StreamEventTypes.Provider: {
              if (data.type === 'text-delta') {
                response += data.textDelta
                setResponseStream(response)
              }
              break
            }
            default:
              break
          }
        }
      } catch (error) {
        setError(error as Error)
      } finally {
        setResponseStream(undefined)
      }
    },
    [addMessageToConversation, setError, documentLogUuid],
  )

  return { onChat }
}
