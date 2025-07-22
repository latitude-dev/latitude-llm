import { addMessageToLatteAction } from '$/actions/latte/addMessage'
import { createNewLatteAction } from '$/actions/latte/new'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { useServerAction } from 'zsa-react'

import React, { useCallback, useMemo, useState } from 'react'
import {
  LatteInteraction,
  LatteInteractionStep,
  LatteToolStep,
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
import { LatteThreadUpdateArgs } from '@latitude-data/core/browser'

/**
 * Main hook for managing Latte chat interactions and project changes.
 *
 * This hook provides a complete interface for:
 * - Sending messages to the Latte AI assistant
 * - Managing chat state (threads, interactions, loading states)
 * - Handling project changes (accept, undo, feedback)
 * - Real-time updates via WebSocket connections
 * - Context-aware chat with project/commit/document information
 *
 * @returns {Object} Hook interface containing:
 *   - sendMessage: Function to send a message to the AI
 *   - resetChat: Function to clear all chat state and changes
 *   - isLoading: Boolean indicating if a request is in progress
 *   - interactions: Array of chat interactions with steps and outputs
 *   - error: String containing any error messages
 *   - changes: Array of pending project changes
 *   - acceptChanges: Function to apply pending changes
 *   - undoChanges: Function to revert pending changes
 *   - feedbackRequested: Boolean indicating if feedback is needed
 *   - addFeedbackToLatteChange: Function to provide feedback on changes
 */
export function useLatte() {
  const latteContext = useLatteContext()

  // State management
  const {
    threadUuid,
    setThreadUuid,
    isLoading,
    setIsLoading,
    interactions,
    setInteractions,
    error,
    setError,
    resetChat,
  } = useLatteChatState()

  const {
    changes,
    setChanges,
    latteActionsFeedbackUuid,
    setLatteActionsFeedbackUuid,
    resetChanges,
  } = useLatteChangesState()

  // Actions
  const { sendMessage } = useLatteChatActions(
    threadUuid,
    setThreadUuid,
    setInteractions,
    setIsLoading,
    setError,
    latteContext,
  )

  const { acceptChanges, undoChanges, addFeedbackToLatteChange } =
    useLatteChangeActions(
      threadUuid,
      setIsLoading,
      setError,
      setChanges,
      setLatteActionsFeedbackUuid,
      changes,
    )

  // Socket handlers
  useLatteThreadUpdates(threadUuid, setInteractions, setIsLoading, setError)
  useLatteProjectChanges(threadUuid, setChanges, setLatteActionsFeedbackUuid)

  // Combined reset function
  const resetChatAndChanges = useCallback(() => {
    resetChat()
    resetChanges()
  }, [resetChat, resetChanges])

  return useMemo(
    () => ({
      sendMessage,
      resetChat: resetChatAndChanges,
      isLoading,
      interactions,
      error,
      changes,
      acceptChanges,
      undoChanges,
      feedbackRequested: !!latteActionsFeedbackUuid,
      addFeedbackToLatteChange: (feedback: string) =>
        addFeedbackToLatteChange(feedback, latteActionsFeedbackUuid!),
    }),
    [
      sendMessage,
      resetChatAndChanges,
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

// Hook for managing chat state
function useLatteChatState() {
  const [threadUuid, setThreadUuid] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [interactions, setInteractions] = useState<LatteInteraction[]>([])
  const [error, setError] = useState<string>()

  const resetChat = useCallback(() => {
    setThreadUuid(undefined)
    setInteractions([])
    setIsLoading(false)
    setError(undefined)
  }, [])

  return {
    threadUuid,
    setThreadUuid,
    isLoading,
    setIsLoading,
    interactions,
    setInteractions,
    error,
    setError,
    resetChat,
  }
}

// Hook for managing changes state
function useLatteChangesState() {
  const [changes, setChanges] = useState<LatteChange[]>([])
  const [latteActionsFeedbackUuid, setLatteActionsFeedbackUuid] =
    useState<string>()

  const resetChanges = useCallback(() => {
    setChanges([])
    setLatteActionsFeedbackUuid(undefined)
  }, [])

  return {
    changes,
    setChanges,
    latteActionsFeedbackUuid,
    setLatteActionsFeedbackUuid,
    resetChanges,
  }
}

// Hook for chat actions (create new, add message)
function useLatteChatActions(
  threadUuid: string | undefined,
  setThreadUuid: (uuid: string) => void,
  setInteractions: React.Dispatch<React.SetStateAction<LatteInteraction[]>>,
  setIsLoading: (loading: boolean) => void,
  setError: (error: string | undefined) => void,
  latteContext: () => string,
) {
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
    [
      threadUuid,
      addMessageToExistingChat,
      createNewChat,
      latteContext,
      setInteractions,
      setIsLoading,
    ],
  )

  return { sendMessage }
}

// Hook for change management actions
function useLatteChangeActions(
  threadUuid: string | undefined,
  setIsLoading: (loading: boolean) => void,
  setError: (error: string | undefined) => void,
  setChanges: React.Dispatch<React.SetStateAction<LatteChange[]>>,
  setLatteActionsFeedbackUuid: (uuid: string | undefined) => void,
  changes: LatteChange[],
) {
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
        trigger('LatteProjectChanges', {
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
  }, [threadUuid, executeAcceptChanges, setIsLoading])

  const undoChanges = useCallback(() => {
    if (!threadUuid) return
    setIsLoading(true)
    executeUndoChanges({ threadUuid })
  }, [threadUuid, executeUndoChanges, setIsLoading])

  const addFeedbackToLatteChange = useCallback(
    (feedback: string, evaluationResultUuid: string) => {
      setLatteActionsFeedbackUuid(undefined)
      if (!evaluationResultUuid) return
      if (feedback.trim() === '') return
      setIsLoading(true)
      executeAddFeedbackToLatteChange({
        content: feedback,
        evaluationResultUuid,
      })
    },
    [
      executeAddFeedbackToLatteChange,
      setLatteActionsFeedbackUuid,
      setIsLoading,
    ],
  )

  return {
    acceptChanges,
    undoChanges,
    addFeedbackToLatteChange,
  }
}

// Hook for handling thread updates
function useLatteThreadUpdates(
  threadUuid: string | undefined,
  setInteractions: React.Dispatch<React.SetStateAction<LatteInteraction[]>>,
  setIsLoading: (loading: boolean) => void,
  setError: (error: string | undefined) => void,
) {
  const handleThreadUpdate = useCallback(
    (update: LatteThreadUpdateArgs) => {
      const currentTimeAsString = new Date().toString()
      if (!update) {
        console.warn(
          'Received empty latteThreadUpdate event from server',
          currentTimeAsString,
        )
        return
      }
      const { threadUuid: incomingthreadUuid } = update
      if (!threadUuid) return
      if (threadUuid !== incomingthreadUuid) return

      if (update.type === 'error') {
        setError(update.error.message)
        setIsLoading(false)
        return
      }

      // React strict mode will call this function twice. this fixes that.
      let fuckReactStrictMode = false

      setInteractions((prev) => {
        if (fuckReactStrictMode) return prev
        fuckReactStrictMode = true

        if (!prev.length) return prev

        const otherInteractions = prev.slice(0, -1)
        const lastInteraction = [...prev.slice(-1)][0]!

        if (update.type === 'fullResponse') {
          lastInteraction.output = update.response
          setIsLoading(false)
        }

        if (update.type === 'responseDelta') {
          lastInteraction.output = (lastInteraction.output ?? '') + update.delta
        }

        if (update.type === 'toolCompleted') {
          const finishedToolId = update.toolCallId
          lastInteraction.steps = lastInteraction.steps.map((step) => {
            if (
              step.type === 'tool' &&
              !step.finished &&
              step.id === finishedToolId
            ) {
              step.finished = true
            }
            return step
          })
        }

        if (update.type === 'toolStarted') {
          let steps: LatteInteractionStep[] = [
            {
              type: 'tool',
              id: update.toolCallId,
              toolName: update.toolName,
              parameters: update.args,
              finished: false,
              ...getDescriptionFromToolCall({
                toolCallId: update.toolCallId,
                toolName: update.toolName,
                args: update.args,
              }),
            } as LatteToolStep,
          ]

          if (update.toolName === LatteTool.editProject) {
            const actions = (
              update.args as {
                actions: LatteEditAction[]
              }
            ).actions

            steps = actions.map(
              (action) =>
                ({
                  type: 'action',
                  action,
                }) as LatteActionStep,
            )
          }

          if (update.toolName === LatteTool.think) {
            steps = [
              {
                type: 'thought',
                content: update.args['thought'] as string,
              },
            ]
          }

          lastInteraction.steps.push(...steps)
        }

        return [...otherInteractions, lastInteraction]
      })
    },
    [threadUuid, setInteractions, setIsLoading, setError],
  )

  useSockets({
    event: 'latteThreadUpdate',
    onMessage: handleThreadUpdate,
  })
}

// Hook for handling project changes
function useLatteProjectChanges(
  threadUuid: string | undefined,
  setChanges: React.Dispatch<React.SetStateAction<LatteChange[]>>,
  setLatteActionsFeedbackUuid: (uuid: string | undefined) => void,
) {
  useSockets({
    event: 'latteProjectChanges',
    onMessage: (msg: { threadUuid: string; changes: LatteChange[] }) => {
      if (!msg) {
        console.warn('Received empty latteProjectChanges event from server')
        return
      }
      const { threadUuid: incomingThreadUuid, changes: newChanges } = msg

      trigger('LatteProjectChanges', {
        changes: newChanges,
        simulateStreaming: true,
      })
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
}
