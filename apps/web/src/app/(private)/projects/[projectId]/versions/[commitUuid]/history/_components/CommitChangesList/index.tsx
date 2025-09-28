import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentChangeSkeleton } from '@latitude-data/web-ui/molecules/DocumentChange'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { useCommitsChanges } from '$/stores/commitChanges'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/browser'
import { useDocumentDiff } from '$/stores/documentDiff'
import { useRouter } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { useCurrentTheme } from '$/hooks/useCurrentTheme'
import { useDocumentActions } from './documentActions'
import useDocumentVersions from '$/stores/documentVersions'
import { ReactNode, useMemo } from 'react'
import { ChangedDocument, ModifiedDocumentType } from '@latitude-data/constants'
import { CleanTriggers } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/_components/Sidebar/PublishDraftCommitModal/TriggerChangesList'
import { Commit } from '@latitude-data/core/schema/types'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

function useCanRevert({
  commit,
  change,
}: {
  commit: Commit
  change: ChangedDocument
}) {
  const { project } = useCurrentProject()
  const { commit: currentCommit } = useCurrentCommit()

  const { data: currentDocuments } = useDocumentVersions({
    projectId: project.id,
    commitUuid: currentCommit.mergedAt ? HEAD_COMMIT : currentCommit.uuid,
  })
  const currentVersionOfDocument = useMemo(() => {
    return currentDocuments?.find((d) => d.documentUuid === change.documentUuid)
  }, [currentDocuments, change])

  // The diff will only be relevant if the change is just a simple content Update
  const requiresDiff = change.changeType === ModifiedDocumentType.Updated
  const { data: diff } = useDocumentDiff({
    commit: requiresDiff ? commit : undefined,
    documentUuid: requiresDiff ? change.documentUuid : undefined,
  })

  if (change.changeType === ModifiedDocumentType.Deleted) {
    // If the change was deleting the document, reversing it requires to re-create the document
    // A document can only be re-created if it does not currently exist in the commit
    return !currentVersionOfDocument
  }

  if (!currentVersionOfDocument) {
    // Reversing any of the rest of available changes will require to either modify or remove the document
    // This can only be done if the document exists in the target commit
    return false
  }

  if (change.changeType === ModifiedDocumentType.Created) {
    // We already know the document exists in the target commit, so it can be removed
    return true
  }

  const documentHasChanged =
    diff?.newValue !== diff?.oldValue ||
    currentVersionOfDocument.path !== change.path

  // If the document has not changed, there is no change to revert anymore
  return documentHasChanged
}

function useCanReset({
  commit,
  change,
  isCurrentDraft,
}: {
  commit: Commit
  change: ChangedDocument
  isCurrentDraft?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit: currentCommit } = useCurrentCommit()

  const { data: currentDocuments } = useDocumentVersions({
    projectId: project.id,
    commitUuid: currentCommit.mergedAt ? HEAD_COMMIT : currentCommit.uuid,
  })
  const currentVersionOfDocument = useMemo(() => {
    return currentDocuments?.find((d) => d.documentUuid === change.documentUuid)
  }, [currentDocuments, change])

  // The diff will only be relevant if the change is not in the current draft (resetting it means nothing) or if the change was a Deletion
  const requiresDiff =
    !isCurrentDraft && change.changeType === ModifiedDocumentType.Deleted

  const { data: diff } = useDocumentDiff({
    commit: !requiresDiff ? commit : undefined,
    documentUuid: !requiresDiff ? change.documentUuid : undefined,
  })

  if (isCurrentDraft) return false

  if (change.changeType === ModifiedDocumentType.Deleted) {
    // If the change was deleting the document, resetting it means to re-delete it
    // This only makes sense if the document exists (has been re-created at some point)
    return !!currentVersionOfDocument
  }

  const documentHasChanged =
    diff?.newValue !== diff?.oldValue ||
    currentVersionOfDocument?.path !== change.path

  // If the document has not changed, there is no change to reset anymore
  return documentHasChanged
}

function Change({
  commit,
  change,
  isSelected,
  onSelect,
  isDimmed,
  isCurrentDraft,
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
  const { getChangesToRevert, getChangesToReset } = useDocumentActions({
    commit,
    change,
  })

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
    commit,
    change,
  })
  const canReset = useCanReset({
    commit,
    change,
    isCurrentDraft,
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
          {
            label: 'Reset prompt to this version',
            onClick: getChangesToReset,
            disabled: !canReset,
          },
        ]}
        isDimmed={isDimmed}
      />
    </li>
  )
}

function ChangeList({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='px-2'>
        <Text.H4M>{title}</Text.H4M>
      </div>
      {children}
    </div>
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
  const { data: changes, isLoading } = useCommitsChanges({ commit })
  const { commit: currentCommit } = useCurrentCommit()
  const theme = useCurrentTheme()

  if (!commit) {
    return (
      <div className='w-full h-full flex flex-col items-center justify-center '>
        <Text.H3M color='foregroundMuted'>No commit selected</Text.H3M>
      </div>
    )
  }

  return (
    <div className='w-full h-full overflow-hidden'>
      <ul className='flex flex-col custom-scrollbar gap-1 pt-4 px-2'>
        {isLoading ? (
          <li>
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
          </li>
        ) : (
          <div className='space-y-8'>
            {changes.anyChanges ? (
              <>
                {changes.triggers.clean.length > 0 ? (
                  <ChangeList title='Trigger changes'>
                    <CleanTriggers
                      changes={changes.triggers.clean}
                      theme={theme}
                    />
                  </ChangeList>
                ) : null}
                {changes.documents.clean.length > 0 ? (
                  <ChangeList title='Prompt changes'>
                    {changes.documents.clean.map((change) => (
                      <Change
                        key={change.documentUuid}
                        commit={commit}
                        change={change}
                        isSelected={
                          selectedDocumentUuid === change.documentUuid
                        }
                        onSelect={() => selectDocumentUuid(change.documentUuid)}
                        isDimmed={
                          currentDocumentUuid !== undefined &&
                          currentDocumentUuid !== change.documentUuid
                        }
                        isCurrentDraft={
                          !commit.mergedAt && commit.id === currentCommit.id
                        }
                      />
                    ))}
                  </ChangeList>
                ) : null}
              </>
            ) : (
              <div className='w-full h-full flex flex-col items-center justify-center p-4'>
                <Text.H5 color='foregroundMuted'>
                  This draft has no changes yet
                </Text.H5>
              </div>
            )}
          </div>
        )}
      </ul>
    </div>
  )
}
