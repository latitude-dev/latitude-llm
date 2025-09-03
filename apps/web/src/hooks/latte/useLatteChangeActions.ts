import { useCallback } from 'react'
import { acceptLatteChangesAction } from '$/actions/latte/acceptChanges'
import { addFeedbackToLatteChangeAction } from '$/actions/latte/addFeedbackToLatteChange'
import { discardLatteChangesActions } from '$/actions/latte/discardChanges'
import { useLatteStore } from '$/stores/latte'
import { trigger } from '$/lib/events'
import { useServerAction } from 'zsa-react'

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
    latteActionsFeedbackUuid,
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
        if (evaluationUuid) {
          setLatteActionsFeedbackUuid(evaluationUuid)
        }
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
        if (evaluationUuid) {
          setLatteActionsFeedbackUuid(evaluationUuid)
        }
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
    (feedback: string) => {
      if (!latteActionsFeedbackUuid) return

      feedback = feedback.trim()
      if (feedback) {
        setIsBrewing(true)
        executeAddFeedbackToLatteChange({
          content: feedback,
          evaluationResultUuid: latteActionsFeedbackUuid,
        })
      }

      setLatteActionsFeedbackUuid(undefined)
    },
    [
      executeAddFeedbackToLatteChange,
      setLatteActionsFeedbackUuid,
      setIsBrewing,
      latteActionsFeedbackUuid,
    ],
  )

  return {
    changes,
    acceptChanges,
    undoChanges,
    addFeedbackToLatteChange,
  }
}
