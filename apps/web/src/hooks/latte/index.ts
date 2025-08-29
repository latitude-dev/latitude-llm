'use client'

import { acceptLatteChangesAction } from '$/actions/latte/acceptChanges'
import { addFeedbackToLatteChangeAction } from '$/actions/latte/addFeedbackToLatteChange'
import { addMessageToLatteAction } from '$/actions/latte/addMessage'
import { discardLatteChangesActions } from '$/actions/latte/discardChanges'
import { createNewLatteAction } from '$/actions/latte/new'
import { stopChatLatteAction } from '$/actions/latte/stopChat'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { trigger } from '$/lib/events'
import { ROUTES } from '$/services/routes'
import { useCurrentUser } from '$/stores/currentUser'
import { useLatteStore } from '$/stores/latte'
import useProviderLogs from '$/stores/providerLogs'
import useFeature from '$/stores/useFeature'
import {
  LatteChange,
  LatteEditAction,
  LatteTool,
} from '@latitude-data/constants/latte'
import { LatteThreadUpdateArgs } from '@latitude-data/core/browser'
import { LatteVersion } from '@latitude-data/core/services/copilot/latte/debugVersions'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { sortBy } from 'lodash-es'
import { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { useServerAction } from 'zsa-react'
import useFetcher from '../useFetcher'
import { useOnce } from '../useMount'
import { useLatteContext } from './context'
import { getDescriptionFromToolCall } from './helpers'
import {
  LatteActionStep,
  LatteInteraction,
  LatteInteractionStep,
  LatteToolStep,
} from './types'
import { useLatteUsage } from './usage'

const EMPTY_ARRAY = [] as const

/**
 * Synchronizes the Latte thread UUID with local storage on mount.
 * Reads the thread UUID from local storage on component mount and updates the store accordingly.
 */
export function useSyncLatteUrlState() {
  const { threadUuid, setThreadUuid } = useLatteStore()
  const { value: storedThreadUuid, setValue: setStoredThreadUuid } =
    useLocalStorage<string | undefined>({
      key: AppLocalStorage.latteThreadUuid,
      defaultValue: undefined,
    })

  useOnce(() => {
    // If `threadUuid` exists and `storedThreadUuid` does not, set the local storage to `threadUuid`
    // If both `threadUuid` and `storedThreadUuid` exist, update the local storage to `threadUuid`
    // If `threadUuid` does not exist but `storedThreadUuid` does, set `threadUuid` to `storedThreadUuid`
    // If neither `threadUuid` nor `storedThreadUuid` exist, do nothing
    if (storedThreadUuid) {
      if (threadUuid) {
        if (threadUuid !== storedThreadUuid) {
          setStoredThreadUuid(threadUuid)
        }
      } else {
        setThreadUuid(storedThreadUuid)
      }
    } else {
      if (threadUuid) {
        setStoredThreadUuid(threadUuid)
      }
    }
  })
}

/**
 * Provides chat actions for Latte conversations including creating new chats and sending messages.
 *
 * @returns An object containing:
 *   - `sendMessage`: Function to send a message to the current or new Latte thread
 *   - `stopChat`: Function to stop the current active Latte response
 */
export function useLatteChatActions() {
  const latteContext = useLatteContext()
  const {
    threadUuid,
    setThreadUuid,
    setIsBrewing,
    setError,
    addInteractions,
    debugVersionUuid,
    setJobId: setJobId,
  } = useLatteStore()
  const { execute: createNewChat } = useServerAction(createNewLatteAction, {
    onSuccess: ({ data }) => {
      setThreadUuid(data.uuid)
      setJobId(data.jobId)
    },
    onError: ({ err }) => {
      setError(err.message)
      setIsBrewing(false)
    },
  })

  const { execute: addMessageToExistingChat } = useServerAction(
    addMessageToLatteAction,
    {
      onSuccess: ({ data }) => {
        setJobId(data.jobId)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsBrewing(false)
      },
    },
  )

  const { execute: stopChat } = useServerAction(stopChatLatteAction, {
    onSuccess: () => {
      setIsBrewing(false)
      setJobId(undefined)
    },
    onError: ({ err }) => {
      setError(err.message)
      setIsBrewing(false)
      setJobId(undefined)
    },
  })

  const sendMessage = useCallback(
    async (message: string) => {
      setIsBrewing(true)

      const newInteraction: LatteInteraction = {
        input: message,
        steps: [],
        output: undefined,
      }

      addInteractions([newInteraction])

      const context = await latteContext()

      if (threadUuid) addMessageToExistingChat({ threadUuid, message, context })
      else createNewChat({ message, context, debugVersionUuid })
    },
    [
      addInteractions,
      addMessageToExistingChat,
      createNewChat,
      latteContext,
      setIsBrewing,
      threadUuid,
      debugVersionUuid,
    ],
  )

  return { sendMessage, stopChat }
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
    setIsBrewing,
    setError,
  } = useLatteStore()

  const { execute: executeAcceptChanges } = useServerAction(
    acceptLatteChangesAction,
    {
      onSuccess: ({ data: { evaluationUuid } }) => {
        trigger('LatteChangesAccepted', { changes })
        setChanges([])
        setIsBrewing(false)
        setLatteActionsFeedbackUuid(evaluationUuid)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsBrewing(false)
      },
    },
  )

  const { execute: executeUndoChanges } = useServerAction(
    discardLatteChangesActions,
    {
      onSuccess: ({ data: { evaluationUuid } }) => {
        trigger('LatteChangesRejected', { changes })
        // Undo changes in the UI
        trigger('LatteProjectChanges', {
          changes: changes.map((c) => ({
            ...c,
            previous: c.current,
            current: c.previous ?? {
              ...c.current,
              deletedAt: new Date(),
            },
          })),
        })
        // Clear changes state
        setChanges([])
        setIsBrewing(false)
        setLatteActionsFeedbackUuid(evaluationUuid)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsBrewing(false)
      },
    },
  )

  const { execute: executeAddFeedbackToLatteChange } = useServerAction(
    addFeedbackToLatteChangeAction,
    {
      onSuccess: () => {
        setIsBrewing(false)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsBrewing(false)
      },
    },
  )

  const acceptChanges = useCallback(() => {
    if (!threadUuid) return
    setIsBrewing(true)
    executeAcceptChanges({ threadUuid })
  }, [threadUuid, executeAcceptChanges, setIsBrewing])

  const undoChanges = useCallback(() => {
    if (!threadUuid) return
    setIsBrewing(true)
    executeUndoChanges({ threadUuid })
  }, [threadUuid, executeUndoChanges, setIsBrewing])

  const addFeedbackToLatteChange = useCallback(
    (feedback: string, evaluationResultUuid?: string) => {
      setLatteActionsFeedbackUuid(undefined)

      if (!evaluationResultUuid) return
      if (feedback.trim() === '') return
      setIsBrewing(true)
      executeAddFeedbackToLatteChange({
        content: feedback,
        evaluationResultUuid,
      })
    },
    [
      executeAddFeedbackToLatteChange,
      setLatteActionsFeedbackUuid,
      setIsBrewing,
    ],
  )

  return {
    changes,
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
  const {
    threadUuid,
    setInteractions,
    setIsBrewing,
    setError,
    setUsage,
    setIsLoadingUsage,
  } = useLatteStore()

  const {
    data: usage,
    isLoading: isLoadingUsage,
    isValidating: isValidatingUsage,
    mutate: mutateUsage,
  } = useLatteUsage()
  useEffect(() => setUsage(usage), [usage, setUsage])
  useEffect(
    () => setIsLoadingUsage(isLoadingUsage || isValidatingUsage),
    [isLoadingUsage, isValidatingUsage, setIsLoadingUsage],
  )

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
        setIsBrewing(false)
        return
      }

      if (update.type === 'usage') {
        mutateUsage(update.usage)
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
          setIsBrewing(false)
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
    [threadUuid, setInteractions, setIsBrewing, setError, mutateUsage],
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

      trigger('LatteProjectChanges', { changes: newChanges })
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
 * Only runs if there are no previous interactions stored in the current chat state so to avoid overriding the current state.
 */
export function useLoadThreadFromProviderLogs() {
  const { interactions, setInteractions } = useLatteStore()
  const { providerLog, isLoading } = useLatteThreadProviderLog()

  useEffect(() => {
    if (interactions.length > 0) return
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
  }, [providerLog, setInteractions, interactions])

  return isLoading
}

/**
 * Fetches the latest provider log for the current thread UUID.
 */
const useLatteThreadProviderLog = () => {
  const { threadUuid } = useLatteStore()
  const { data: providerLogs, ...rest } = useProviderLogs({
    documentLogUuid: threadUuid,
  })
  const providerLog = useMemo(
    () => sortBy(providerLogs, 'generatedAt').at(-1),
    [providerLogs],
  )

  return useMemo(() => ({ providerLog, ...rest }), [providerLog, rest])
}

/**
 * Handles debug data
 */
export function useLatteDebugMode() {
  const { debugVersionUuid, setDebugVersionUuid } = useLatteStore()
  const { isEnabled: debugModeEnabled, isLoading: isLoadingFeatureFlag } =
    useFeature('latteDebugMode')
  const { data: user, isLoading: isLoadingUser } = useCurrentUser()

  const enabled = debugModeEnabled && user?.admin

  const fetcher = useFetcher<LatteVersion[]>(
    enabled ? ROUTES.api.latte.debug.versions.root : undefined,
  )

  const { data = EMPTY_ARRAY, isLoading: isLoadingLatteDebugVersions } = useSWR<
    LatteVersion[]
  >(['latteDebugVersions'], fetcher)

  const isLoading =
    isLoadingUser || isLoadingFeatureFlag || isLoadingLatteDebugVersions

  const selectedVersionUuid = useMemo(() => {
    if (!enabled) return undefined
    if (!data) return debugVersionUuid

    if (data.some((version) => version.uuid == debugVersionUuid)) {
      return debugVersionUuid
    }

    return data.find((version) => version.isLive)?.uuid
  }, [enabled, debugVersionUuid, data])

  useEffect(() => {
    // When the list of versions has loaded, if the selected debugVersionUuid is not on the list, automatically unset it
    if (isLoading) return
    if (!debugVersionUuid) return

    if (data.some((version) => version.uuid === debugVersionUuid)) {
      return
    }

    setDebugVersionUuid(undefined)
  }, [isLoading, debugVersionUuid, data, setDebugVersionUuid])

  return useMemo(
    () => ({
      enabled,
      data,
      isLoading,
      selectedVersionUuid,
      setSelectedVersionUuid: setDebugVersionUuid,
    }),
    [enabled, data, selectedVersionUuid, isLoading, setDebugVersionUuid],
  )
}
