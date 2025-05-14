import { addMessageToCopilotChatAction } from '$/actions/copilot/chat/addMessage'
import { createNewCopilotChatAction } from '$/actions/copilot/chat/new'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ContentType, MessageRole, TextContent } from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  extractAgentToolCalls,
} from '@latitude-data/constants'
import { Message } from '@latitude-data/core/browser'
import { useCallback, useState } from 'react'
import { CopilotChatInteraction } from './types'
import { getDescriptionFromToolCall } from './helpers'
import { useParams } from 'next/navigation'

export function useCopilotChat() {
  const [chatUuid, setChatUuid] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)

  const [interactions, setInteractions] = useState<CopilotChatInteraction[]>([])
  const [error, setError] = useState<string>()

  const { projectId, commitUuid } = useParams<{
    projectId: string
    commitUuid: string
  }>()

  const resetChat = useCallback(() => {
    setChatUuid(undefined)
    setInteractions([])
    setIsLoading(false)
    setError(undefined)
  }, [])

  const { execute: createNewChat } = useLatitudeAction(
    createNewCopilotChatAction,
    {
      onSuccess: ({ data }) => setChatUuid(data.uuid),
      onError: ({ err }) => {
        setError(err.message)
        setIsLoading(false)
      },
    },
  )

  const { execute: addMessageToExistingChat } = useLatitudeAction(
    addMessageToCopilotChatAction,
    {
      onSuccess: ({ data }) => setChatUuid(data.uuid),
      onError: ({ err }) => {
        setError(err.message)
        setIsLoading(false)
      },
    },
  )

  const sendMessage = useCallback(
    ({ message }: { message: string }) => {
      setIsLoading(true)
      const newInteraction: CopilotChatInteraction = {
        input: message,
        steps: [],
        output: undefined,
      }

      if (chatUuid) {
        setInteractions((prev) => [...prev, newInteraction])
        addMessageToExistingChat({ projectId, commitUuid, message, chatUuid })
        return
      }

      setInteractions([newInteraction])
      createNewChat({ projectId, commitUuid, message })
    },
    [projectId, commitUuid, chatUuid, addMessageToExistingChat, createNewChat],
  )

  const handleNewMessage = useCallback(
    ({
      chatUuid: incomingChatUuid,
      message,
    }: {
      chatUuid: string
      message: Message
    }) => {
      if (!chatUuid) return
      if (chatUuid !== incomingChatUuid) return

      // React strict mode will call this function twice. this fixes that.
      let fuckReactStrictMode = false

      setInteractions((prev) => {
        if (fuckReactStrictMode) return prev
        fuckReactStrictMode = true

        if (!prev.length) return prev

        const otherInteractions = prev.slice(0, -1)
        const lastInteraction = [...prev.slice(-1)][0]!

        if (message.role === MessageRole.tool) {
          // Mark actions from last interaction as finished
          const finishedToolIds = message.content.map((c) => c.toolCallId)
          if (lastInteraction) {
            lastInteraction.steps = lastInteraction.steps.map((step) => {
              if (typeof step === 'string') return step
              if (step.finished) return step
              if (!finishedToolIds.includes(step.id)) return step
              return {
                ...step,
                finished: true,
              }
            })
          }
        }

        // Add new steps to the last interaction
        if (message.role === MessageRole.assistant) {
          if (typeof message.content === 'string') {
            lastInteraction.steps.push(message.content)
          } else {
            const textContent = message.content
              .filter((c) => c.type === ContentType.text)
              .map((c) => (c as unknown as TextContent).text!)

            if (textContent.length) {
              lastInteraction.steps.push(...textContent)
            }
          }

          const [responseToolCalls, otherToolCalls] = extractAgentToolCalls(
            message.toolCalls,
          )

          if (otherToolCalls.length) {
            const actions = message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              finished: false,
              ...getDescriptionFromToolCall(toolCall),
            }))
            lastInteraction.steps.push(...actions)
          }

          if (responseToolCalls.length) {
            const response = responseToolCalls[0]!.arguments[
              'response'
            ] as string
            lastInteraction.output = response
          }
        }

        return [...otherInteractions, lastInteraction]
      })

      if (
        Array.isArray(message.content) &&
        message.content.some(
          (c) =>
            c.type === ContentType.toolCall &&
            c.toolName === AGENT_RETURN_TOOL_NAME,
        )
      ) {
        setIsLoading(false)
      }
    },
    [chatUuid],
  )

  useSockets({
    event: 'latteMessage',
    onMessage: handleNewMessage,
  })

  useSockets({
    event: 'latteError',
    onMessage: ({ error }) => {
      setError(error)
      setIsLoading(false)
    },
  })

  return {
    sendMessage,
    resetChat,
    isLoading,
    interactions,
    error,
  }
}
