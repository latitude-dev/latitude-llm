import { addSharedMessagesAction } from '$/actions/sdk/addSharedMessagesAction'
import { Message as ConversationMessage } from '@latitude-data/constants/messages'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCallback } from 'react'
import { readStreamableValue } from '@ai-sdk/rsc'
import { ChainEvent, ChainEventTypes } from '@latitude-data/constants'

import { StreamEventTypes } from '@latitude-data/core/constants'

import { PublishedDocument } from '@latitude-data/core/schema/models/types/PublishedDocument'
export function useChat({
  shared,
  documentLogUuid,
  setMessages,
  setResponseStream,
  setError,
}: {
  shared: PublishedDocument
  documentLogUuid: string | undefined
  setMessages: ReactStateDispatch<ConversationMessage[]>
  setResponseStream: ReactStateDispatch<string | undefined>
  setError: ReactStateDispatch<Error | undefined>
}) {
  const onChat = useCallback(
    async (input: string) => {
      if (!documentLogUuid) return // This should not happen

      const message: ConversationMessage = {
        role: 'user',
        content: [{ type: 'text', text: input }],
      }

      setResponseStream('')
      setMessages((prev) => [...prev, message])

      let response = ''

      try {
        const { output } = await addSharedMessagesAction({
          publishedDocumentUuid: shared.uuid!,
          documentLogUuid,
          messages: [message],
        })

        for await (const serverEvent of readStreamableValue(output)) {
          if (!serverEvent) continue

          const { event, data } = serverEvent as ChainEvent

          // Delta text from the provider
          if (event === StreamEventTypes.Provider) {
            if (data.type === 'text-delta') {
              response += data.textDelta
              setResponseStream(response)
            }
            continue
          }

          setMessages(data.messages)

          // Step started
          if (data.type === ChainEventTypes.StepStarted) {
            setResponseStream('')
            response = ''
          }

          // Step finished
          if (data.type === ChainEventTypes.ProviderCompleted) {
            setResponseStream(undefined)
          }

          // Error
          if (data.type === ChainEventTypes.ChainError) {
            setError(new Error(data.error.message))
          }
        }
      } catch (error) {
        setError(error as Error)
      } finally {
        setResponseStream(undefined)
      }
    },
    [setMessages, setError, documentLogUuid, setResponseStream, shared.uuid],
  )

  return { onChat }
}
