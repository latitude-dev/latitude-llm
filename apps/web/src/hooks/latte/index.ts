'use client'

import { addMessageToLatteAction } from '$/actions/latte/addMessage'
import { createNewLatteAction } from '$/actions/latte/new'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { useServerAction } from 'zsa-react'

import { useCallback, useEffect } from 'react'
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
import { useLatteStore } from '$/stores/latte'
import { useSearchParams } from 'next/navigation'
import { useLatteThreadProviderLog } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/providers/LatteThreadProvider'
import { useMount } from '../useMount'

/**
 * Synchronizes the Latte thread UUID with the URL search parameters on mount.
 * Reads the thread UUID from the URL on component mount and updates the store or the URL accordingly.
 */
export function useSyncLatteUrlState() {
  const { threadUuid, setThreadUuid } = useLatteStore()
  const searchParams = useSearchParams()

  useMount(() => {
    // If `threadUuid` exists and `urlThreadUuid` does not, set the URL search parameter to `threadUuid
    // If both `threadUuid` and `urlThreadUuid` exist, update the URL search parameter to `threadUuid`
    // If `threadUuid` does not exist but `urlThreadUuid` does, set `threadUuid` to `urlThreadUuid`
    // If neither `threadUuid` nor `urlThreadUuid` exist, do nothing
    const urlThreadUuid = searchParams.get('latteThreadUuid') || undefined
    const newSearchParams = new URLSearchParams(searchParams.toString())

    if (urlThreadUuid) {
      if (threadUuid) {
        if (threadUuid !== urlThreadUuid) {
          newSearchParams.set('latteThreadUuid', threadUuid)
        }
      } else {
        setThreadUuid(urlThreadUuid)
      }
    } else {
      if (threadUuid) {
        newSearchParams.set('latteThreadUuid', threadUuid)
      }
    }

    const newUrl = `?${newSearchParams.toString()}`
    const currentUrl = `?${searchParams.toString()}`

    if (newUrl !== currentUrl) {
      window.history.replaceState(null, '', newUrl)
    }
  })
}

/**
 * Provides chat actions for Latte conversations including creating new chats and sending messages.
 *
 * @returns An object containing:
 *   - `sendMessage`: Function to send a message to the current or new Latte thread
 */
export function useLatteChatActions() {
  const latteContext = useLatteContext()
  const { threadUuid, setThreadUuid, setIsLoading, setError, addInteractions } =
    useLatteStore()
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

      addInteractions([newInteraction])

      if (threadUuid) {
        addMessageToExistingChat({
          threadUuid,
          message,
          context: latteContext(),
        })
      } else {
        createNewChat({ message, context: latteContext() })
      }
    },
    [
      addInteractions,
      addMessageToExistingChat,
      createNewChat,
      latteContext,
      setIsLoading,
      threadUuid,
    ],
  )

  return { sendMessage }
}

/**
 * Provides actions for managing Latte project changes including accepting, undoing, and providing feedback.
 *
 * @returns An object containing:
 *   - `acceptChanges`: Function to accept all pending changes
 *   - `undoChanges`: Function to undo all pending changes
 *   - `addFeedbackToLatteChange`: Function to add feedback to a specific change
 */
export function useLatteChangeActions() {
  const {
    threadUuid,
    changes,
    setChanges,
    setLatteActionsFeedbackUuid,
    setIsLoading,
    setError,
  } = useLatteStore()

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
    (feedback: string, evaluationResultUuid?: string) => {
      if (!evaluationResultUuid) return
      if (feedback.trim() === '') return

      setLatteActionsFeedbackUuid(undefined)
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

/**
 * Handles real-time updates from the Latte thread via WebSocket connections.
 * Processes different types of updates including response deltas, tool completions,
 * and tool starts, updating the interactions state accordingly.
 */
export function useLatteThreadUpdates() {
  const { threadUuid, setInteractions, setIsLoading, setError } =
    useLatteStore()
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

/**
 * Handles real-time project changes from the Latte thread via WebSocket connections.
 * Processes incoming changes and updates the changes state, handling additions,
 * updates, and removals of changes based on the current thread.
 */
export function useLatteProjectChanges() {
  const { threadUuid, setChanges, setLatteActionsFeedbackUuid } =
    useLatteStore()

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

/**
 * Loads and transforms provider logs into Latte interactions.
 * Fetches provider logs for the current thread UUID and converts them
 * into a structured format of user-assistant interactions with input/output pairs.
 */
export function useLoadThreadFromProviderLogs() {
  const { setInteractions } = useLatteStore()
  const { providerLog } = useLatteThreadProviderLog()

  useEffect(() => {
    if (!providerLog) return

    // iterate over provider log messages and transform them to an array of interactions. Interactors are input/output pairs input defined as any message from a user and outputs defined as all messages not from user until the next user message.
    const messages = providerLog.messages || []
    const _interactions: LatteInteraction[] = []
    let currentInteraction: LatteInteraction | null = null

    for (const message of messages) {
      if (message.role === 'user') {
        // Start a new interaction for user messages
        if (currentInteraction) {
          _interactions.push(currentInteraction)
        }
        currentInteraction = {
          input:
            message.content.filter((t) => t.type === 'text').at(-1)?.text ?? '',
          steps: [],
          output: undefined,
        }
      } else if (message.role === 'assistant' && currentInteraction) {
        currentInteraction.output =
          typeof message.content === 'string'
            ? message.content
            : // @ts-expect-error - cast message content to TextContent
              (message.content.filter((t) => t.type === 'text').at(-1)?.text ??
              '')
      }
    }

    // Add the last interaction if it exists
    if (currentInteraction) {
      currentInteraction.output = providerLog.response

      _interactions.push(currentInteraction)
    }

    // Update the interactions state if we have any
    if (_interactions.length > 0) {
      setInteractions(_interactions)
    }
  }, [providerLog, setInteractions])
}
