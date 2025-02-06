import { addSharedMessagesAction } from '$/actions/sdk/addSharedMessagesAction'
import {
  Message as ConversationMessage,
  MessageRole,
  ContentType,
} from '@latitude-data/compiler'
import {
  buildMessagesFromResponse,
  LegacyChainEventTypes,
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

          // Delta text from the provider
          if (event === StreamEventTypes.Provider) {
            if (data.type === 'text-delta') {
              response += data.textDelta
              setResponseStream(response)
            }
            continue
          }

          // Step started
          if (data.type === LegacyChainEventTypes.Step) {
            setResponseStream('')
            response = ''
          }

          // Step finished
          if (data.type === LegacyChainEventTypes.StepComplete) {
            const responseMsgs = buildMessagesFromResponse(data)
            responseMsgs.forEach(addMessageToConversation)
            setResponseStream(undefined)
          }

          // Chain finished
          if (data.type === LegacyChainEventTypes.Complete) {
            setResponseStream(undefined)
          }

          // Error
          if (data.type === LegacyChainEventTypes.Error) {
            setError(new Error(data.error.message))
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
