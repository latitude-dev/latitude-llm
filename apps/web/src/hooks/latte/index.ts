import { addMessageToLatteAction } from '$/actions/latte/addMessage'
import { createNewLatteAction } from '$/actions/latte/new'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { useServerAction } from 'zsa-react'
import { ContentType, MessageRole, TextContent } from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  extractAgentToolCalls,
} from '@latitude-data/constants'
import { Message } from '@latitude-data/core/browser'
import { useCallback, useMemo, useState } from 'react'
import { LatteInteraction } from './types'
import { getDescriptionFromToolCall } from './helpers'
import { trigger } from '$/lib/events'
import { useLatteContext } from './context'
import { LatteEditAction, LatteTool } from '@latitude-data/constants/latte'
import { acceptLatteChangesAction } from '$/actions/latte/acceptChanges'
import { discardLatteChangesActions } from '$/actions/latte/discardChanges'

export function useLatte() {
  const [threadUuid, setThreadUuid] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)

  const [interactions, setInteractions] = useState<LatteInteraction[]>([])
  const [error, setError] = useState<string>()

  const latteContext = useLatteContext()

  const resetChat = useCallback(() => {
    setThreadUuid(undefined)
    setInteractions([])
    setIsLoading(false)
    setError(undefined)
  }, [])

  const { execute: createNewChat } = useServerAction(createNewLatteAction, {
    onSuccess: ({ data }) => {
      setThreadUuid(data.uuid)
    },
    onError: ({ err }) => {
      setError(err.message)
      setIsLoading(false)
    },
  })

  const { execute: addMessageToExistingChat } = useServerAction(
    addMessageToLatteAction,
    {
      onError: ({ err }) => {
        setError(err.message)
        setIsLoading(false)
      },
    },
  )

  const { execute: executeAcceptChanges } = useServerAction(
    acceptLatteChangesAction,
  )
  const { execute: executeUndoChanges } = useServerAction(
    discardLatteChangesActions,
  )
  const acceptChanges = useCallback(() => {
    if (!threadUuid) return
    executeAcceptChanges({ threadUuid })
  }, [threadUuid, executeAcceptChanges])
  const undoChanges = useCallback(() => {
    if (!threadUuid) return
    executeUndoChanges({ threadUuid })
  }, [threadUuid, executeUndoChanges])

  const sendMessage = useCallback(
    ({ message }: { message: string }) => {
      setIsLoading(true)
      const newInteraction: LatteInteraction = {
        input: message,
        steps: [],
        output: undefined,
      }

      if (threadUuid) {
        setInteractions((prev) => [...prev, newInteraction])
        addMessageToExistingChat({
          threadUuid,
          message,
          context: latteContext(),
        })
        return
      }

      setInteractions([newInteraction])
      createNewChat({ message, context: latteContext() })
    },
    [threadUuid, addMessageToExistingChat, createNewChat, latteContext],
  )

  const handleNewMessage = useCallback(
    ({
      threadUuid: incomingthreadUuid,
      message,
    }: {
      threadUuid: string
      message: Message
    }) => {
      if (!threadUuid) return
      if (threadUuid !== incomingthreadUuid) return

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
              if (
                step.type === 'tool' &&
                !step.finished &&
                finishedToolIds.includes(step.id)
              ) {
                step.finished = true
              }

              return step
            })
          }
        }

        // Add new steps to the last interaction
        if (message.role === MessageRole.assistant) {
          if (typeof message.content === 'string') {
            lastInteraction.steps.push({
              type: 'thought',
              content: message.content,
            })
          } else {
            const textContent = message.content
              .filter((c) => c.type === ContentType.text)
              .map((c) => (c as unknown as TextContent).text!)

            if (textContent.length) {
              lastInteraction.steps.push(
                ...textContent.map((text) => ({
                  type: 'thought' as 'thought',
                  content: text,
                })),
              )
            }
          }

          const [responseToolCalls, otherToolCalls] = extractAgentToolCalls(
            message.toolCalls,
          )

          if (otherToolCalls.length) {
            const toolSteps = message.toolCalls.map((toolCall) => {
              if (toolCall.name === LatteTool.editProject) {
                const params = toolCall.arguments as {
                  actions: LatteEditAction[]
                }
                return params.actions.map((action) => ({
                  type: 'action' as 'action',
                  action,
                }))
              }

              return {
                type: 'tool' as 'tool',
                id: toolCall.id,
                toolName: toolCall.name,
                parameters: toolCall.arguments,
                finished: false,
                ...getDescriptionFromToolCall(toolCall),
              }
            })

            lastInteraction.steps.push(...toolSteps.flat())
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
    [threadUuid],
  )

  useSockets({
    event: 'latteMessage',
    onMessage: handleNewMessage,
  })

  useSockets({
    event: 'latteDraftUpdate',
    onMessage: ({ draftUuid, updates }) => {
      trigger('DraftUpdatedByLatte', { draftUuid, updates })
    },
  })

  const handleError = useCallback(
    ({
      threadUuid: incomingthreadUuid,
      error,
    }: {
      threadUuid: string
      error: string
    }) => {
      if (!threadUuid) return
      if (threadUuid !== incomingthreadUuid) return
      setError(error)
      setIsLoading(false)
    },
    [threadUuid],
  )

  useSockets({
    event: 'latteError',
    onMessage: handleError,
  })

  return useMemo(
    () => ({
      sendMessage,
      resetChat,
      isLoading,
      interactions,
      error,
      acceptChanges,
      undoChanges,
    }),
    [
      sendMessage,
      resetChat,
      isLoading,
      interactions,
      error,
      acceptChanges,
      undoChanges,
    ],
  )
}
