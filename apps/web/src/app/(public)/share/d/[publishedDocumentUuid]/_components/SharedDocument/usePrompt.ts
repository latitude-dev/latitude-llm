import { Dispatch, useCallback, useRef, useState } from 'react'

import {
  ContentType,
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/compiler'
import {
  PublishedDocument,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import { runSharedPromptAction } from '$/actions/sdk/runSharedPromptAction'
import { readStreamableValue } from 'ai/rsc'
import { SetStateAction } from '@latitude-data/web-ui/commonTypes'
import { ChainEvent, ChainEventTypes } from '@latitude-data/constants'

type AccoumulatedDeltaMessage = { deltas: string[] }
export type LastMessage = {
  lastMessage: ConversationMessage | undefined
  deltas: string[]
}

function splitInWords(text: string) {
  return text.split(' ').map((word, index) => (index === 0 ? word : ` ${word}`))
}

function getDeltas({
  accomulatedDeltas,
  accomulateIndex,
  lastMessage,
}: {
  accomulatedDeltas: AccoumulatedDeltaMessage[]
  accomulateIndex: number
  lastMessage: ConversationMessage | undefined
}) {
  try {
    // -1 because last message is the current one
    const deltas = accomulatedDeltas[accomulateIndex - 1]?.deltas

    if ((deltas?.length ?? 0) > 0) return deltas ?? []

    const content = lastMessage?.content

    if (content === undefined) return []

    if (typeof content === 'string') return splitInWords(content)

    return content.flatMap((c) => {
      if (c.type === ContentType.image) return []
      if (c.type === ContentType.file) return []
      if (c.type === ContentType.toolCall)
        return splitInWords(JSON.stringify(c))
      if (c.type === ContentType.toolResult)
        return splitInWords(JSON.stringify(c))

      return splitInWords(c.text)
    })
  } catch (error) {
    return []
  }
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
  const setMessages: Dispatch<SetStateAction<ConversationMessage[]>> =
    useCallback(
      (
        value:
          | ConversationMessage[]
          | ((prevMessages: ConversationMessage[]) => ConversationMessage[]),
      ) => {
        setConversation((prevConversation) => {
          return {
            ...prevConversation,
            messages:
              typeof value === 'function'
                ? value(prevConversation?.messages ?? [])
                : value,
          } as Conversation
        })
      },
      [setConversation],
    )

  const runPrompt = useCallback(
    async (parameters: Record<string, string>) => {
      isLoadingPrompt.current = true
      setIsStreaming(true)
      let response = ''
      let accomulateIndex = 0
      let accomulatedDeltas: AccoumulatedDeltaMessage[] = [{ deltas: [] }]
      let messagesCount = 0
      let lastMessage: ConversationMessage | undefined

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

          const { event, data } = serverEvent as ChainEvent

          // Delta text from the provider
          if (event === StreamEventTypes.Provider) {
            if (data.type === 'text-delta') {
              accomulatedDeltas[accomulateIndex]!.deltas.push(data.textDelta)
              response += data.textDelta

              setResponseStream(response)
            }
            continue
          }

          setMessages(data.messages)
          messagesCount = data.messages.length

          // Step started
          if (data.type === ChainEventTypes.StepStarted) {
            response = ''
          }

          if (data.type === ChainEventTypes.ProviderCompleted) {
            response = ''
            response = ''
            accomulatedDeltas.push({ deltas: [] })
            accomulateIndex++

            setResponseStream(undefined)
            messagesCount += data.messages!.length

            lastMessage = data.messages[data.messages.length - 1]
          }

          // Chain finished
          if (
            data.type === ChainEventTypes.ChainCompleted ||
            data.type === ChainEventTypes.ToolsRequested
          ) {
            const deltas = getDeltas({
              accomulatedDeltas,
              accomulateIndex,
              lastMessage,
            })
            setLastMessage({ lastMessage, deltas })
            setChainLength(messagesCount)
          }

          // Error
          if (data.type === ChainEventTypes.ChainError) {
            setError(new Error(data.error.message))
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
    [runSharedPromptAction, setMessages, shared.uuid],
  )

  const resetPrompt = useCallback(() => {
    setError(undefined)
    setResponseStream('')
    setIsStreaming(false)
    setConversation(undefined)
    setChainLength(Infinity)
    setConversation(undefined)
    setLastMessage(undefined)
    setDocumentLogUuid(undefined)
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
    setMessages,
    setResponseStream,
    setError,
  }
}
