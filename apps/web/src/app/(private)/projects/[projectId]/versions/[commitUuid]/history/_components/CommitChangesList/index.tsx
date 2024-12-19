import { Commit, ModifiedDocumentType } from '@latitude-data/core/browser'
import { ChangedDocument } from '@latitude-data/core/repositories'
import {
  DocumentChange,
  DocumentChangeSkeleton,
  Text,
} from '@latitude-data/web-ui'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { useCommitsChanges } from '$/stores/commitChanges'
import { useCurrentCommit } from '@latitude-data/web-ui/browser'
import { useDocumentDiff } from '$/stores/documentDiff'
import { useRouter } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { useHistoryActionModalContext } from '../ActionModal'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { getChangesToRevertDocumentAction } from '$/actions/history/revertDocumentVersion/getChangesToRevertDocumentAction'
import { revertDocumentChangesAction } from '$/actions/history/revertDocumentVersion/revertDocumentAction'
import { useCallback } from 'react'

function useCanRevert({
  changeType,
  commit,
  documentUuid,
}: {
  changeType: ModifiedDocumentType
  commit: Commit
  documentUuid: string
}) {
  const isUpdate = changeType === ModifiedDocumentType.Updated

  const { data: diff, isLoading: isDiffLoading } = useDocumentDiff({
    commit: isUpdate ? commit : undefined,
    documentUuid: isUpdate ? documentUuid : undefined,
  })

  if (!isUpdate) return true // Can always revert Created, Deleted and Renamed
  return !isDiffLoading && diff?.newValue !== diff?.oldValue // If there is no diff, the update comes from a reference, which cannot be reverted from here
}

function useDocumentActions({
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

  const getChangesToRevert = useCallback(() => {
    open({
      title: `Revert changes from ${change.path}`,
      onConfirm: () =>
        executeRevertChanges({
          projectId: commit.projectId,
          targetDraftId: currentCommit.mergedAt ? undefined : currentCommit.id,
          documentUuid: change.documentUuid,
          documentCommitUuid: commit.uuid,
        }),
    })

    executeGetChangesToRevert({
      projectId: commit.projectId,
      targetDraftId: currentCommit.mergedAt ? undefined : currentCommit.id,
      documentUuid: change.documentUuid,
      documentCommitUuid: commit.uuid,
    })
  }, [commit, change])

  return {
    getChangesToRevert,
  }
}

function Change({
  commit,
  change,
  isSelected,
  onSelect,
  isDimmed,
}: {
  commit: Commit
  change: ChangedDocument
  isSelected: boolean
  onSelect: () => void
  isDimmed?: boolean
  isCurrentDraft?: boolean
}) {
  const router = useRouter()
  const { commit: currentCommit } = useCurrentCommit()
  const { getChangesToRevert } = useDocumentActions({ commit, change })

  const goToDocument = () => {
    router.push(
      ROUTES.projects
        .detail({ id: commit.projectId })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: change.documentUuid }).root,
    )
  }

  const filterDocument = () => {
    router.push(
      ROUTES.projects
        .detail({ id: commit.projectId })
        .commits.detail({ uuid: currentCommit.uuid })
        .history.detail({ uuid: change.documentUuid }).root,
    )
  }

  const { data: prevDocument } = useDocumentVersion(
    change.changeType === ModifiedDocumentType.UpdatedPath
      ? change.documentUuid
      : null,
  )

  const canRevert = useCanRevert({
    changeType: change.changeType,
    commit,
    documentUuid: change.documentUuid,
  })

  return (
    <li>
      <DocumentChange
        path={change.path}
        changeType={change.changeType}
        oldPath={prevDocument?.path}
        isSelected={isSelected}
        onClick={onSelect}
        options={[
          {
            label: 'Open in editor',
            onClick: goToDocument,
            disabled: change.changeType === ModifiedDocumentType.Deleted,
          },
          {
            label: 'Filter by prompt',
            onClick: filterDocument,
          },
          {
            label: 'Revert changes',
            onClick: getChangesToRevert,
            disabled: !canRevert,
          },
        ]}
        isDimmed={isDimmed}
      />
    </li>
  )
}

export function CommitChangesList({
  commit,
  selectedDocumentUuid,
  selectDocumentUuid,
  currentDocumentUuid,
}: {
  commit: Commit
  selectedDocumentUuid?: string
  selectDocumentUuid: (documentUuid: string) => void
  currentDocumentUuid?: string
}) {
  const { data: changes, isLoading } = useCommitsChanges(commit)
  const { commit: currentCommit } = useCurrentCommit()

  if (!commit) {
    return (
      <div className='w-full h-full flex flex-col items-center justify-center '>
        <Text.H5M color='foregroundMuted'>No commit selected</Text.H5M>
      </div>
    )
  }

  return (
    <div className='w-full h-full overflow-hidden'>
      <ul className='flex flex-col custom-scrollbar gap-1 pt-4 px-2'>
        {isLoading ? (
          <>
            <DocumentChangeSkeleton
              width={62}
              changeType={ModifiedDocumentType.Deleted}
            />
            <DocumentChangeSkeleton
              width={87}
              changeType={ModifiedDocumentType.Updated}
            />
            <DocumentChangeSkeleton
              width={23}
              changeType={ModifiedDocumentType.Created}
            />
            <DocumentChangeSkeleton
              width={67}
              changeType={ModifiedDocumentType.Updated}
            />
          </>
        ) : (
          <>
            {changes.length ? (
              changes.map((change) => (
                <Change
                  key={change.documentUuid}
                  commit={commit}
                  change={change}
                  isSelected={selectedDocumentUuid === change.documentUuid}
                  onSelect={() => selectDocumentUuid(change.documentUuid)}
                  isDimmed={
                    currentDocumentUuid !== undefined &&
                    currentDocumentUuid !== change.documentUuid
                  }
                  isCurrentDraft={
                    !commit.mergedAt && commit.id === currentCommit.id
                  }
                />
              ))
            ) : (
              <div className='w-full h-full flex flex-col items-center justify-center p-4'>
                <Text.H5 color='foregroundMuted'>
                  This draft has no changes yet
                </Text.H5>
              </div>
            )}
          </>
        )}
      </ul>
    </div>
  )
}
