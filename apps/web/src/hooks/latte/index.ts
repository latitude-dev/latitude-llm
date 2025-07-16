import { addMessageToLatteAction } from '$/actions/latte/addMessage'
import { createNewLatteAction } from '$/actions/latte/new'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { useServerAction } from 'zsa-react'
import { CoreMessage as Message, ToolCall } from 'ai'

import { useCallback, useMemo, useState } from 'react'
import {
  LatteInteraction,
  LatteInteractionStep,
  LatteToolStep,
  LatteThoughtStep,
  LatteActionStep,
} from './types'
import { getDescriptionFromToolCall } from './helpers'
import { trigger } from '$/lib/events'
import { useLatteContext } from './context'
import {
  LatteChange,
  LatteEditAction,
  LatteTool,
} from '@latitude-data/constants/latte'
import { acceptLatteChangesAction } from '$/actions/latte/acceptChanges'
import { discardLatteChangesActions } from '$/actions/latte/discardChanges'
import { addFeedbackToLatteChangeAction } from '$/actions/latte/addFeedbackToLatteChange'
import { ContentType, MessageRole, TextContent } from 'promptl-ai'

export function useLatte() {
  const [threadUuid, setThreadUuid] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)

  const [interactions, setInteractions] = useState<LatteInteraction[]>([])
  const [error, setError] = useState<string>()
  const [changes, setChanges] = useState<LatteChange[]>([])

  const [latteActionsFeedbackUuid, setLatteActionsFeedbackUuid] =
    useState<string>()

  const latteContext = useLatteContext()

  const resetChat = useCallback(() => {
    setThreadUuid(undefined)
    setInteractions([])
    setIsLoading(false)
    setError(undefined)
    setChanges([])
    setLatteActionsFeedbackUuid(undefined)
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
    {
      onSuccess: ({ data: { evaluationUuid } }) => {
        setChanges([])
        setIsLoading(false)
        setLatteActionsFeedbackUuid(evaluationUuid)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsLoading(false)
      },
    },
  )
  const { execute: executeUndoChanges } = useServerAction(
    discardLatteChangesActions,
    {
      onSuccess: ({ data: { evaluationUuid } }) => {
        // Undo changes in the UI
        trigger('LatteChanges', {
          changes: changes.map((c) => ({
            ...c,
            previous: c.current,
            current: c.previous ?? { ...c.current, isDeleted: true },
          })),
        })
        // Clear changes state
        setChanges([])
        setIsLoading(false)
        setLatteActionsFeedbackUuid(evaluationUuid)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsLoading(false)
      },
    },
  )
  const { execute: executeAddFeedbackToLatteChange } = useServerAction(
    addFeedbackToLatteChangeAction,
    {
      onSuccess: () => {
        setIsLoading(false)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsLoading(false)
      },
    },
  )
  const acceptChanges = useCallback(() => {
    if (!threadUuid) return
    setIsLoading(true)
    executeAcceptChanges({ threadUuid })
  }, [threadUuid, executeAcceptChanges])
  const undoChanges = useCallback(() => {
    if (!threadUuid) return
    setIsLoading(true)
    executeUndoChanges({ threadUuid })
  }, [threadUuid, executeUndoChanges])
  const addFeedbackToLatteChange = useCallback(
    (feedback: string) => {
      setLatteActionsFeedbackUuid(undefined)
      if (!latteActionsFeedbackUuid) return
      if (feedback.trim() === '') return
      setIsLoading(true)
      executeAddFeedbackToLatteChange({
        content: feedback,
        evaluationResultUuid: latteActionsFeedbackUuid,
      })
    },
    [latteActionsFeedbackUuid, executeAddFeedbackToLatteChange],
  )

  const sendMessage = useCallback(
    (message: string) => {
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
    (msg: { threadUuid: string; message: Message }) => {
      const currentTimeAsString = new Date().toString()
      if (!msg) {
        console.warn(
          'Received empty latteMessage message from server',
          currentTimeAsString,
        )
        return
      }
      const { threadUuid: incomingthreadUuid, message } = msg
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

        if (message.role === MessageRole.assistant) {
          if (typeof message.content === 'string') {
            lastInteraction.output = message.content
            return [...otherInteractions, lastInteraction]
          }

          if (message.content.every((c) => c.type === ContentType.text)) {
            const textContent = message.content
              .filter((c) => c.type === ContentType.text)
              .map((c) => (c as unknown as TextContent).text!)
              .join('\n')

            lastInteraction.output = textContent
            return [...otherInteractions, lastInteraction]
          }

          const newInteractionSteps: LatteInteractionStep[] = message.content
            .map((c) => {
              if (c.type === ContentType.toolCall) {
                const toolCall = c as ToolCall<string, Record<string, unknown>>

                if (toolCall.toolName === LatteTool.editProject) {
                  const params = toolCall.args as {
                    actions: LatteEditAction[]
                  }

                  return params.actions.map(
                    (action) =>
                      ({
                        type: 'action',
                        action,
                      }) as LatteActionStep,
                  )
                }

                return {
                  type: 'tool',
                  id: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  parameters: toolCall.args,
                  finished: false,
                  ...getDescriptionFromToolCall(toolCall),
                } as LatteToolStep
              }

              if (c.type === ContentType.text && c.text?.length) {
                return {
                  type: 'thought',
                  content: c.text,
                } as LatteThoughtStep
              }

              return [] // Ignore other content types
            })
            .flat()

          lastInteraction.steps.push(...newInteractionSteps)

          return [...otherInteractions, lastInteraction]
        }

        return prev
      })

      setIsLoading(false)
    },
    [threadUuid],
  )

  useSockets({
    event: 'latteMessage',
    onMessage: handleNewMessage,
  })

  useSockets({
    event: 'latteChanges',
    onMessage: (msg: { threadUuid: string; changes: LatteChange[] }) => {
      if (!msg) {
        console.warn('Received empty latteChanges message from server')
        return
      }
      const { threadUuid: incomingThreadUuid, changes: newChanges } = msg

      trigger('LatteChanges', { changes: newChanges, simulateStreaming: true })
      if (!threadUuid || threadUuid !== incomingThreadUuid) return

      setLatteActionsFeedbackUuid(undefined)

      // Update the changes state: Update existing changes, add new ones, and remove equal changes
      setChanges((prevChanges) => {
        const updatedChanges = [...prevChanges]

        newChanges.forEach((newChange) => {
          const index = updatedChanges.findIndex(
            (change) =>
              change.draftUuid === newChange.draftUuid &&
              change.current.documentUuid === newChange.current.documentUuid,
          )

          if (index === -1) {
            // Add new change
            updatedChanges.push(newChange)
            return
          }

          // Change already exists
          const existingChange = updatedChanges[index]!

          if (existingChange.previous === newChange.current) {
            // Change returned the prompt to the previous state, remove from changes
            updatedChanges.splice(index, 1)
            return
          }

          // Update existing change
          updatedChanges[index]!.current = newChange.current
        })

        return updatedChanges
      })
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
      changes,
      acceptChanges,
      undoChanges,
      feedbackRequested: !!latteActionsFeedbackUuid,
      addFeedbackToLatteChange,
    }),
    [
      sendMessage,
      resetChat,
      isLoading,
      interactions,
      error,
      changes,
      acceptChanges,
      undoChanges,
      latteActionsFeedbackUuid,
      addFeedbackToLatteChange,
    ],
  )
}
