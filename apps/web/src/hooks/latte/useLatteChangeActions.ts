'use client'

import { acceptLatteChangesAction } from '$/actions/latte/acceptChanges'
import { addFeedbackToLatteChangeAction } from '$/actions/latte/addFeedbackToLatteChange'
import { discardLatteChangesActions } from '$/actions/latte/discardChanges'
import { partialAcceptLatteChangesAction } from '$/actions/latte/partialAcceptChanges'
import { partialRejectLatteChangesAction } from '$/actions/latte/partialRejectChanges'
import { trigger } from '$/lib/events'
import { useLatteStore } from '$/stores/latte/index'
import { useCallback, useMemo } from 'react'
import { useServerAction } from 'zsa-react'

/**
 * Provides actions for managing Latte project changes including accepting,
 * undoing, and providing feedback.
 */
export function useLatteChangeActions() {
  const {
    threadUuid,
    latteActionsFeedbackUuid,
    setLatteActionsFeedbackUuid,
    setError,
  } = useLatteStore()

  const { execute: executeAcceptChanges } = useServerAction(
    acceptLatteChangesAction,
    {
      onSuccess: ({ data: { checkpoints, evaluationUuid } }) => {
        trigger('LatteChangesAccepted', {
          threadUuid: threadUuid!,
          checkpoints,
        })

        if (evaluationUuid) {
          setLatteActionsFeedbackUuid(evaluationUuid)
        }
      },
      onError: ({ err }) => {
        setError(err.message)
      },
    },
  )

  const { execute: executeUndoChanges } = useServerAction(
    discardLatteChangesActions,
    {
      onSuccess: ({ data: { checkpoints, evaluationUuid } }) => {
        trigger('LatteChangesRejected', {
          threadUuid: threadUuid!,
          checkpoints,
        })

        if (evaluationUuid) {
          setLatteActionsFeedbackUuid(evaluationUuid)
        }
      },
      onError: ({ err }) => {
        setError(err.message)
      },
    },
  )

  const { execute: executeAcceptPartialChanges } = useServerAction(
    partialAcceptLatteChangesAction,
    {
      onSuccess: ({ data: { evaluationUuid, checkpoints } }) => {
        trigger('LatteChangesAccepted', {
          threadUuid: threadUuid!,
          checkpoints,
        })

        if (evaluationUuid) {
          setLatteActionsFeedbackUuid(evaluationUuid)
        }
      },
      onError: ({ err }) => {
        setError(err.message)
      },
    },
  )

  const { execute: executeRejectPartialChanges } = useServerAction(
    partialRejectLatteChangesAction,
    {
      onSuccess: ({ data: { evaluationUuid, checkpoints } }) => {
        trigger('LatteChangesRejected', {
          threadUuid: threadUuid!,
          checkpoints,
        })

        if (evaluationUuid) {
          setLatteActionsFeedbackUuid(evaluationUuid)
        }
      },
      onError: ({ err }) => {
        setError(err.message)
      },
    },
  )

  const { execute: executeAddFeedbackToLatteChange } = useServerAction(
    addFeedbackToLatteChangeAction,
    {
      onError: ({ err }) => {
        setError(err.message)
      },
    },
  )

  const acceptChanges = useCallback(() => {
    if (!threadUuid) return
    executeAcceptChanges({ threadUuid })
  }, [threadUuid, executeAcceptChanges])

  const undoChanges = useCallback(() => {
    if (!threadUuid) return
    executeUndoChanges({ threadUuid })
  }, [threadUuid, executeUndoChanges])

  const acceptPartialChanges = useCallback(
    async ({ documentUuids }: { documentUuids: string[] }) => {
      if (!threadUuid) return

      await executeAcceptPartialChanges({
        threadUuid,
        documentUuidsToAccept: documentUuids,
      })
    },
    [threadUuid, executeAcceptPartialChanges],
  )

  const undoPartialChanges = useCallback(
    async ({ documentUuids }: { documentUuids: string[] }) => {
      if (!threadUuid) return

      await executeRejectPartialChanges({
        threadUuid,
        documentUuidsToReject: documentUuids,
      })
    },
    [threadUuid, executeRejectPartialChanges],
  )

  const addFeedbackToLatteChange = useCallback(
    (feedback: string) => {
      if (!latteActionsFeedbackUuid) return

      feedback = feedback.trim()
      if (feedback) {
        executeAddFeedbackToLatteChange({
          content: feedback,
          evaluationResultUuid: latteActionsFeedbackUuid,
        })
      }

      // Note: empty latte actions feedback uuid even if we dont
      // have feedback to be able to close the feedback input form
      setLatteActionsFeedbackUuid(undefined)
    },
    [
      executeAddFeedbackToLatteChange,
      setLatteActionsFeedbackUuid,
      latteActionsFeedbackUuid,
    ],
  )

  return useMemo(
    () => ({
      acceptChanges,
      undoChanges,
      acceptPartialChanges,
      undoPartialChanges,
      addFeedbackToLatteChange,
    }),
    [
      acceptChanges,
      undoChanges,
      acceptPartialChanges,
      undoPartialChanges,
      addFeedbackToLatteChange,
    ],
  )
}
