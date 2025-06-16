import { Commit } from '@latitude-data/core/browser'
import { useCurrentCommit } from '@latitude-data/web-ui/browser'
import { useRouter } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { useHistoryActionModalContext } from '../ActionModal'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { getChangesToRevertDocumentAction } from '$/actions/history/revertDocumentVersion/getChangesToRevertDocumentAction'
import { revertDocumentChangesAction } from '$/actions/history/revertDocumentVersion/revertDocumentAction'
import { useCallback } from 'react'
import { getChangesToResetDocumentAction } from '$/actions/history/resetDocumentVersion/getChangesToResetDocumentAction'
import { resetDocumentVersionAction } from '$/actions/history/resetDocumentVersion/resetDocumentVersionAction'
import { ChangedDocument } from '@latitude-data/constants'

export function useDocumentActions({
  commit,
  change,
}: {
  commit: Commit
  change: ChangedDocument
}) {
  const router = useRouter()
  const { open, setError, setChanges } = useHistoryActionModalContext()
  const { commit: currentCommit } = useCurrentCommit()

  const { execute: executeGetChangesToRevert } = useLatitudeAction(
    getChangesToRevertDocumentAction,
    {
      onSuccess: ({ data: changes }) => {
        setChanges(changes)
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const { execute: executeGetChangesToReset } = useLatitudeAction(
    getChangesToResetDocumentAction,
    {
      onSuccess: ({ data: changes }) => {
        setChanges(changes)
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const { execute: executeRevertChanges } = useLatitudeAction(
    revertDocumentChangesAction,
    {
      onSuccess: ({ data: { commitUuid, documentUuid } }) => {
        const commitBaseRoute = ROUTES.projects
          .detail({ id: commit.projectId })
          .commits.detail({ uuid: commitUuid }).documents
        const route = documentUuid
          ? commitBaseRoute.detail({ uuid: documentUuid }).root
          : commitBaseRoute.root
        router.push(route)
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const { execute: executeResetChanges } = useLatitudeAction(
    resetDocumentVersionAction,
    {
      onSuccess: ({ data: { commitUuid, documentUuid } }) => {
        const commitBaseRoute = ROUTES.projects
          .detail({ id: commit.projectId })
          .commits.detail({ uuid: commitUuid }).documents
        const route = documentUuid
          ? commitBaseRoute.detail({ uuid: documentUuid }).root
          : commitBaseRoute.root
        router.push(route)
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const getChangesToRevert = useCallback(() => {
    open({
      title: `Revert changes from ${change.path}`,
      onConfirm: () =>
        executeRevertChanges({
          projectId: commit.projectId,
          targetDraftUuid: currentCommit.mergedAt
            ? undefined
            : currentCommit.uuid,
          documentUuid: change.documentUuid,
          documentCommitUuid: commit.uuid,
        }),
    })

    executeGetChangesToRevert({
      projectId: commit.projectId,
      targetDraftUuid: currentCommit.mergedAt ? undefined : currentCommit.uuid,
      documentUuid: change.documentUuid,
      documentCommitUuid: commit.uuid,
    })
  }, [
    commit,
    change,
    currentCommit.mergedAt,
    currentCommit.uuid,
    executeGetChangesToRevert,
    executeRevertChanges,
    open,
  ])

  const getChangesToReset = useCallback(() => {
    open({
      title: `Reset document to ${change.path}`,
      onConfirm: () =>
        executeResetChanges({
          projectId: commit.projectId,
          targetDraftUuid: currentCommit.mergedAt
            ? undefined
            : currentCommit.uuid,
          documentUuid: change.documentUuid,
          documentCommitUuid: commit.uuid,
        }),
    })

    executeGetChangesToReset({
      projectId: commit.projectId,
      targetDraftUuid: currentCommit.mergedAt ? undefined : currentCommit.uuid,
      documentUuid: change.documentUuid,
      documentCommitUuid: commit.uuid,
    })
  }, [
    commit,
    change,
    currentCommit.mergedAt,
    currentCommit.uuid,
    executeGetChangesToReset,
    executeResetChanges,
    open,
  ])

  return {
    getChangesToRevert,
    getChangesToReset,
  }
}
