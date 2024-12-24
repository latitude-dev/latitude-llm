import { Commit } from '@latitude-data/core/browser'
import { useCurrentCommit } from '@latitude-data/web-ui/browser'
import { useRouter } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { useHistoryActionModalContext } from '../ActionModal'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useCallback } from 'react'
import { getChangesToRevertCommitAction } from '$/actions/history/revertCommitVersion/getChangesToRevertCommitAction'
import { revertCommitChangesAction } from '$/actions/history/revertCommitVersion/revertCommitAction'
import { getChangesToResetCommitAction } from '$/actions/history/resetCommitVersion/getChangesToResetCommitAction'
import { resetCommitVersionAction } from '$/actions/history/resetCommitVersion/resetCommitVersionAction'

export function useCommitActions({ commit }: { commit: Commit }) {
  const router = useRouter()
  const { open, setError, setChanges } = useHistoryActionModalContext()
  const { commit: currentCommit } = useCurrentCommit()

  const { execute: executeGetChangesToRevert } = useLatitudeAction(
    getChangesToRevertCommitAction,
    {
      onSuccess: ({ data: changes }) => {
        setChanges(changes)
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const { execute: executeGetChangesToReset } = useLatitudeAction(
    getChangesToResetCommitAction,
    {
      onSuccess: ({ data: changes }) => {
        setChanges(changes)
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const { execute: executeRevertChanges } = useLatitudeAction(
    revertCommitChangesAction,
    {
      onSuccess: ({ data: { commitUuid } }) => {
        router.push(
          ROUTES.projects
            .detail({ id: commit.projectId })
            .commits.detail({ uuid: commitUuid }).root,
        )
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const { execute: executeResetChanges } = useLatitudeAction(
    resetCommitVersionAction,
    {
      onSuccess: ({ data: { commitUuid } }) => {
        router.push(
          ROUTES.projects
            .detail({ id: commit.projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      },
      onError: ({ err: error }) => setError(error.message),
    },
  )

  const getChangesToRevert = useCallback(() => {
    open({
      title: `Revert changes from v${commit.version} "${commit.title}"`,
      onConfirm: () =>
        executeRevertChanges({
          projectId: commit.projectId,
          targetDraftUuid: currentCommit.mergedAt
            ? undefined
            : currentCommit.uuid,
          commitUuid: commit.uuid,
        }),
    })

    executeGetChangesToRevert({
      projectId: commit.projectId,
      targetDraftUuid: currentCommit.mergedAt ? undefined : currentCommit.uuid,
      commitUuid: commit.uuid,
    })
  }, [commit])

  const getChangesToReset = useCallback(() => {
    open({
      title: `Reset project to v${commit.version} "${commit.title}"`,
      onConfirm: () =>
        executeResetChanges({
          projectId: commit.projectId,
          targetDraftUuid: currentCommit.mergedAt
            ? undefined
            : currentCommit.uuid,
          commitUuid: commit.uuid,
        }),
    })

    executeGetChangesToReset({
      projectId: commit.projectId,
      targetDraftUuid: currentCommit.mergedAt ? undefined : currentCommit.uuid,
      commitUuid: commit.uuid,
    })
  }, [commit])

  return {
    getChangesToRevert,
    getChangesToReset,
  }
}
