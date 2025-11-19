import { Text } from '@latitude-data/web-ui/atoms/Text'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { useCommitsChanges } from '$/stores/commitChanges'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useDocumentDiff } from '$/stores/documentDiff'
import { useRouter } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { useDocumentActions } from './documentActions'
import useDocumentVersions from '$/stores/documentVersions'
import { ReactNode, useMemo } from 'react'
import {
  ChangedDocument,
  ChangedEvaluation,
  ChangedTrigger,
  CommitChanges,
  DocumentType,
  ModifiedDocumentType,
} from '@latitude-data/constants'

import { HEAD_COMMIT } from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import { DocumentChangeSkeleton } from '@latitude-data/web-ui/molecules/DocumentChange'
import { IndentationLine } from '$/components/Sidebar/Files/IndentationBar'
import { TriggerChangeItem } from '../../../_components/Sidebar/PublishDraftCommitModal/ChangesList/TriggerItem'
import { EvaluationChangeItem } from '../../../_components/Sidebar/PublishDraftCommitModal/ChangesList/EvaluationItem'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { ListItem } from '../../../_components/Sidebar/PublishDraftCommitModal/ChangesList/ListItem'
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

function SubItemsWrapper({
  label,
  items,
  firstIndex,
  totalCount,
}: {
  label: string
  items: ReactNode[]
  firstIndex: number
  totalCount: number
}) {
  return (
    <div className='flex flex-col pl-2 w-full'>
      <div className='flex flex-row items-end gap-2'>
        <IndentationLine showCurve={false} height='h-4' />
        <Text.H6 color='foregroundMuted'>{label}</Text.H6>
      </div>
      {items.map((item, index) => (
        <div key={index} className='flex flex-row w-full'>
          <IndentationLine showCurve={firstIndex + index === totalCount - 1} />
          {item}
        </div>
      ))}
    </div>
  )
}

function EvaluationChangeList({
  projectId,
  commitUuid,
  document,
  evaluationChanges,
  triggerChangesCount,
}: {
  projectId: number
  commitUuid: string
  document: DocumentVersion
  evaluationChanges: ChangedEvaluation[]
  triggerChangesCount: number
}) {
  const { data: evaluations } = useEvaluationsV2({
    project: { id: projectId },
    commit: { uuid: commitUuid },
    document,
  })

  if (!evaluationChanges.length) return null

  return (
    <SubItemsWrapper
      label='Evaluations'
      items={evaluationChanges.map((evaluation) => (
        <EvaluationChangeItem
          key={evaluation.evaluationUuid}
          projectId={projectId}
          commitUuid={commitUuid}
          change={evaluation}
          evaluations={evaluations}
        />
      ))}
      firstIndex={0}
      totalCount={evaluationChanges.length + triggerChangesCount}
    />
  )
}

function TriggerChangeList({
  projectId,
  commitUuid,
  document,
  triggerChanges,
  evaluationChangesCount,
}: {
  projectId: number
  commitUuid: string
  document: DocumentVersion
  triggerChanges: ChangedTrigger[]
  evaluationChangesCount: number
}) {
  if (!triggerChanges.length) return null

  return (
    <SubItemsWrapper
      label='Triggers'
      items={triggerChanges.map((triggerChange) => (
        <TriggerChangeItem
          key={triggerChange.triggerUuid}
          triggerChange={triggerChange}
          projectId={projectId}
          commitUuid={commitUuid}
          documentUuid={document.documentUuid}
        />
      ))}
      firstIndex={evaluationChangesCount}
      totalCount={evaluationChangesCount + triggerChanges.length}
    />
  )
}

function DocumentChangeList({
  document,
  changes,
  commit,
  selectedDocumentUuid,
  selectDocumentUuid,
  currentDocumentUuid,
  isCurrentDraft,
}: {
  document: DocumentVersion
  changes: CommitChanges
  commit: Commit
  selectedDocumentUuid?: string
  selectDocumentUuid: (documentUuid: string) => void
  currentDocumentUuid?: string
  isCurrentDraft: boolean
}) {
  const change = useMemo<ChangedDocument | undefined>(
    () =>
      changes.documents.all.find(
        (cd) => cd.documentUuid === document.documentUuid,
      ),
    [changes.documents.all, document.documentUuid],
  )

  const changedEvaluations = useMemo(
    () =>
      changes.evaluations.all.filter(
        (ce) => ce.documentUuid === document.documentUuid,
      ),
    [changes.evaluations.all, document.documentUuid],
  )

  const changedTriggers = useMemo(
    () =>
      changes.triggers.all.filter(
        (ct) => ct.documentUuid === document.documentUuid,
      ),
    [changes.triggers.all, document.documentUuid],
  )

  return (
    <div className='flex flex-col gap-1'>
      {change ? (
        <Change
          commit={commit}
          change={change}
          isSelected={selectedDocumentUuid === change.documentUuid}
          onSelect={() => selectDocumentUuid(change.documentUuid)}
          isDimmed={
            currentDocumentUuid !== undefined &&
            currentDocumentUuid !== change.documentUuid
          }
          isCurrentDraft={isCurrentDraft}
        />
      ) : (
        <ListItem
          icon={document.documentType === DocumentType.Agent ? 'bot' : 'file'}
          label={document.path}
          changeType={undefined}
          href={
            ROUTES.projects
              .detail({ id: commit.projectId })
              .commits.detail({ uuid: commit.uuid })
              .documents.detail({ uuid: document.documentUuid }).root
          }
        />
      )}

      <EvaluationChangeList
        projectId={commit.projectId}
        commitUuid={commit.uuid}
        document={document}
        evaluationChanges={changedEvaluations}
        triggerChangesCount={changedTriggers.length}
      />
      <TriggerChangeList
        projectId={commit.projectId}
        commitUuid={commit.uuid}
        document={document}
        triggerChanges={changedTriggers}
        evaluationChangesCount={changedEvaluations.length}
      />
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
  const { data: changes, isLoading: isLoadingChanges } = useCommitsChanges({
    commit,
  })
  const { commit: currentCommit } = useCurrentCommit()
  const { project } = useCurrentProject()

  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      projectId: project.id,
      commitUuid: commit?.uuid,
    })

  const isLoading = isLoadingChanges || isLoadingDocuments

  const documentsList = useMemo(() => {
    if (isLoading) return []
    return documents.filter((d) => {
      if (
        changes.documents.all.some((cd) => cd.documentUuid === d.documentUuid)
      )
        return true
      if (
        changes.evaluations.all.some((ce) => ce.documentUuid === d.documentUuid)
      )
        return true
      if (changes.triggers.all.some((ct) => ct.documentUuid === d.documentUuid))
        return true

      return false
    })
  }, [isLoading, changes, documents])

  if (!commit) {
    return (
      <div className='w-full h-full flex flex-col items-center justify-center '>
        <Text.H3M color='foregroundMuted'>No commit selected</Text.H3M>
      </div>
    )
  }

  return (
    <div className='w-full h-full overflow-hidden'>
      <ul className='flex flex-col custom-scrollbar gap-2 pt-4 px-2'>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <DocumentChangeSkeleton
                width={62}
                changeType={ModifiedDocumentType.Updated}
              />
            </li>
          ))
        ) : changes.anyChanges ? (
          documentsList.map((d) => (
            <li key={d.documentUuid}>
              <DocumentChangeList
                document={d}
                changes={changes}
                commit={commit}
                selectedDocumentUuid={selectedDocumentUuid}
                selectDocumentUuid={selectDocumentUuid}
                currentDocumentUuid={currentDocumentUuid}
                isCurrentDraft={
                  !commit.mergedAt && commit.id === currentCommit.id
                }
              />
            </li>
          ))
        ) : (
          <div className='w-full h-full flex flex-col items-center justify-center p-4'>
            <Text.H5 color='foregroundMuted'>
              This draft has no changes yet
            </Text.H5>
          </div>
        )}
      </ul>
    </div>
  )
}
