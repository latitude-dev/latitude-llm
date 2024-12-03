import { useCallback, useRef, useState } from 'react'

import {
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/compiler'
import {
  ChainEventTypes,
  PublishedDocument,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import { runSharedPromptAction } from '$/actions/sdk/runSharedPromptAction'
import { readStreamableValue } from 'ai/rsc'

type AccoumulatedDeltaMessage = { deltas: string[] }
export type LastMessage = {
  lastMessage: ConversationMessage | undefined
  deltas: string[]
}
export function usePrompt({ shared }: { shared: PublishedDocument }) {
  // Local state
  const [documentLogUuid, setDocumentLogUuid] = useState<string>()
  const isLoadingPrompt = useRef<boolean>(false)
  const [error, setError] = useState<Error | undefined>()
  const [responseStream, setResponseStream] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversation, setConversation] = useState<Conversation | undefined>()
  const [lastMessage, setLastMessage] = useState<LastMessage | undefined>(
    undefined,
  )
  const [chainLength, setChainLength] = useState<number>(Infinity)

  const addMessageToConversation = useCallback(
    (message: ConversationMessage) => {
      let newConversation: Conversation
      setConversation((prevConversation) => {
        newConversation = {
          ...prevConversation,
          messages: [...(prevConversation?.messages ?? []), message],
        } as Conversation
        return newConversation
      })
      return newConversation!
    },
    [],
  )

  const runPrompt = useCallback(
    async (parameters: Record<string, string>) => {
      isLoadingPrompt.current = true
      setIsStreaming(true)
      let response = ''
      let accomulateIndex = 0
      let accomulatedDeltas: AccoumulatedDeltaMessage[] = [{ deltas: [] }]
      let messagesCount = 0

      try {
        const { response: actionResponse, output } =
          await runSharedPromptAction({
            publishedDocumentUuid: shared.uuid!,
            parameters,
          })

        actionResponse.then((r) => {
          // Follow up conversation log ID
          setDocumentLogUuid(r?.uuid)
        })

        isLoadingPrompt.current = false

        for await (const serverEvent of readStreamableValue(output)) {
          if (!serverEvent) continue

          const { event, data } = serverEvent

          if ('messages' in data) {
            setResponseStream(undefined)
            data.messages!.forEach(addMessageToConversation)
            messagesCount += data.messages!.length
          }

          switch (event) {
            case StreamEventTypes.Latitude: {
              if (data.type === ChainEventTypes.StepComplete) {
                response = ''
                accomulatedDeltas.push({ deltas: [] })
                accomulateIndex++
              } else if (data.type === ChainEventTypes.Complete) {
                // Last completed step is the previous one
                const deltas =
                  accomulatedDeltas[accomulateIndex - 1]?.deltas ?? []
                setLastMessage({
                  lastMessage:
                    conversation?.messages[conversation?.messages.length - 1],
                  deltas,
                })
                setChainLength(messagesCount)
              } else if (data.type === ChainEventTypes.Error) {
                setError(new Error(data.error.message))
              }

              break
            }

            case StreamEventTypes.Provider: {
              if (data.type === 'text-delta') {
                accomulatedDeltas[accomulateIndex]!.deltas.push(data.textDelta)
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
        isLoadingPrompt.current = false
        setIsStreaming(false)
        setResponseStream(undefined)
      }
    },
    [runSharedPromptAction, addMessageToConversation, shared.uuid],
  )

  const resetPrompt = useCallback(() => {
    setError(undefined)
    setResponseStream('')
    setIsStreaming(false)
    setConversation(undefined)
    setChainLength(Infinity)
    setConversation(undefined)
    setLastMessage(undefined)
    isLoadingPrompt.current = false
  }, [])

  return {
    runPrompt,
    error,
    isStreaming,
    isLoadingPrompt: isLoadingPrompt.current,
    responseStream,
    conversation,
    lastMessage,
    chainLength,
    resetPrompt,
    documentLogUuid,
    addMessageToConversation,
    setResponseStream,
    setError,
  }
}
