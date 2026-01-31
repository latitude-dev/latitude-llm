import { Dispatch, useCallback, useRef, useState } from 'react'
import {
  Conversation,
  Message as ConversationMessage,
} from '@latitude-data/constants/legacyCompiler'
import { runSharedPromptAction } from '$/actions/sdk/runSharedPromptAction'
import { readStreamableValue } from '@ai-sdk/rsc'
import { SetStateAction } from '@latitude-data/web-ui/commonTypes'
import { ChainEvent, ChainEventTypes } from '@latitude-data/constants'

import { StreamEventTypes } from '@latitude-data/core/constants'

import { PublishedDocument } from '@latitude-data/core/schema/models/types/PublishedDocument'
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
      if (c.type === 'image') return []
      if (c.type === 'file') return []
      if (c.type === 'tool-call') return splitInWords(JSON.stringify(c))
      if (c.type === 'tool-result') return splitInWords(JSON.stringify(c))

      return splitInWords(c.text! as string)
    })
  } catch (_error) {
    return []
  }
}

export function usePrompt({ shared }: { shared: PublishedDocument }) {
  // Local state
  const [documentLogUuid, setDocumentLogUuid] = useState<string>()
  const isLoadingPrompt = useRef<boolean>(false)
  const [error, setError] = useState<Error | undefined>()
  const [responseStream, setResponseStream] = useState<string | undefined>()
  const [reasoningStream, setReasoningStream] = useState<string | undefined>()
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

  const sharedUuid = shared.uuid!
  const runPrompt = useCallback(
    async (parameters: Record<string, string>) => {
      isLoadingPrompt.current = true
      setIsStreaming(true)
      let response = ''
      let reasoning = ''
      let rollingIndex = 0
      const accomulatedDeltas: AccoumulatedDeltaMessage[] = [{ deltas: [] }]
      let messagesCount = 0
      let lastMessage: ConversationMessage | undefined

      try {
        const { response: actionResponse, output } =
          await runSharedPromptAction({
            publishedDocumentUuid: sharedUuid,
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
              accomulatedDeltas[rollingIndex]!.deltas.push(data.textDelta)
              response += data.textDelta

              setResponseStream(response)
            }

            if (data.type === 'reasoning-delta') {
              reasoning += data.text

              setReasoningStream(reasoning)
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
            rollingIndex++

            setReasoningStream(undefined)
            setResponseStream(undefined)
            messagesCount += data.messages!.length

            lastMessage = data.messages[data.messages.length - 1]
          }

          // Chain finished
          if (data.type === ChainEventTypes.ChainCompleted) {
            const deltas = getDeltas({
              accomulatedDeltas,
              accomulateIndex: rollingIndex,
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
        setReasoningStream(undefined)
        setResponseStream(undefined)
      }
    },
    [setMessages, sharedUuid],
  )

  const resetPrompt = useCallback(() => {
    setError(undefined)
    setReasoningStream('')
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
    reasoningStream,
    conversation,
    lastMessage,
    chainLength,
    resetPrompt,
    documentLogUuid,
    setMessages,
    setResponseStream,
    setReasoningStream,
    setError,
  }
}
