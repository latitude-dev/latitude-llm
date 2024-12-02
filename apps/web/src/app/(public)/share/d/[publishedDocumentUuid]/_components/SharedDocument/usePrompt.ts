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

export function usePrompt({ shared }: { shared: PublishedDocument }) {
  // Local state
  const [documentLogUuid, setDocumentLogUuid] = useState<string>()
  const isLoadingPrompt = useRef<boolean>(false)
  const [error, setError] = useState<Error | undefined>()
  const [time, setTime] = useState<number>()
  const [responseStream, setResponseStream] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversation, setConversation] = useState<Conversation | undefined>()
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
      const start = performance.now()

      isLoadingPrompt.current = true
      setIsStreaming(true)
      let response = ''
      let messagesCount = 0

      try {
        const { response: actionResponse, output } =
          await runSharedPromptAction({
            publishedDocumentUuid: shared.uuid!,
            parameters,
          })

        actionResponse.then((r) => {
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
              if (data.type === ChainEventTypes.Step) {
                if (data.isLastStep) setChainLength(messagesCount + 1)
              } else if (data.type === ChainEventTypes.StepComplete) {
                response = ''
              } else if (data.type === ChainEventTypes.Complete) {
                setTime(performance.now() - start)
              } else if (data.type === ChainEventTypes.Error) {
                setError(new Error(data.error.message))
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
    setTime(undefined)
    isLoadingPrompt.current = false
  }, [])

  return {
    runPrompt,
    error,
    isStreaming,
    isLoadingPrompt: isLoadingPrompt.current,
    responseStream,
    conversation,
    chainLength,
    time,
    resetPrompt,
    documentLogUuid,
    addMessageToConversation,
    setResponseStream,
    setError,
  }
}
