import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ChangedDocument,
  ChangedEvaluation,
  ChangedTrigger,
  DocumentType,
  type CommitChanges,
} from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ReactNode, useMemo } from 'react'
import React from 'react'
import { ROUTES } from '$/services/routes'
import { ListItem, ChangeItemSkeleton } from './ListItem'
import { TriggerChangeItem } from './TriggerItem'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { EvaluationChangeItem } from './EvaluationItem'
import { IndentationLine } from '$/components/Sidebar/Files/IndentationBar'

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
  selected,
  onSelect,
  projectId,
  commitUuid,
}: {
  document: DocumentVersion
  changes: CommitChanges
  selected?: ChangedDocument
  onSelect: ReactStateDispatch<ChangedDocument | undefined>
  projectId: number
  commitUuid: string
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
      changes.evaluations.all
        .filter((ce) => ce.documentUuid === document.documentUuid)
        .map((ce) => ({
          entity: 'evaluation' as const,
          ...ce,
        })),
    [changes.evaluations.all, document.documentUuid],
  )

  const changedTriggers = useMemo(
    () =>
      changes.triggers.all
        .filter((ct) => ct.documentUuid === document.documentUuid)
        .map((ct) => ({
          entity: 'trigger' as const,
          ...ct,
        })),
    [changes.triggers.all, document.documentUuid],
  )

  return (
    <div className='flex flex-col'>
      <ListItem
        icon={document.documentType === DocumentType.Agent ? 'bot' : 'file'}
        label={document.path}
        hasIssues={(change?.errors ?? 0) > 0}
        changeType={change?.changeType}
        selected={selected?.documentUuid === document.documentUuid}
        onSelect={change ? () => onSelect(change) : undefined}
        href={
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid })
            .documents.detail({ uuid: document.documentUuid }).root
        }
      />

      <EvaluationChangeList
        projectId={projectId}
        commitUuid={commitUuid}
        document={document}
        evaluationChanges={changedEvaluations}
        triggerChangesCount={changedTriggers.length}
      />
      <TriggerChangeList
        projectId={projectId}
        commitUuid={commitUuid}
        document={document}
        triggerChanges={changedTriggers}
        evaluationChangesCount={changedEvaluations.length}
      />
    </div>
  )
}

export function ChangesList({
  selected,
  onSelect,
  projectId,
  commit,
  documents,
  changes,
  isLoading,
}: {
  anyChanges: boolean
  selected?: ChangedDocument
  onSelect: ReactStateDispatch<ChangedDocument | undefined>
  commit: Commit | undefined
  documents: DocumentVersion[]
  changes: CommitChanges
  projectId: number
  isLoading: boolean
  onClose: ReactStateDispatch<number | null>
}) {
  const documentsList = useMemo(() => {
    if (isLoading) return []
    return documents.filter((d) => {
      if (changes.documents.all.some((cd) => cd.documentUuid === d.documentUuid)) return true // prettier-ignore
      if (changes.evaluations.all.some((ce) => ce.documentUuid === d.documentUuid)) return true // prettier-ignore
      if (changes.triggers.all.some((ct) => ct.documentUuid === d.documentUuid)) return true // prettier-ignore

      return false
    })
  }, [isLoading, changes, documents])

  if (isLoading) {
    return (
      <ul className='flex flex-col gap-1'>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <ChangeItemSkeleton />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className='flex flex-col gap-2 overflow-y-auto custom-scrollbar scrollable-indicator'>
      {documentsList.map((d) => (
        <DocumentChangeList
          key={d.documentUuid}
          document={d}
          changes={changes}
          selected={selected}
          onSelect={onSelect}
          projectId={projectId}
          commitUuid={commit?.uuid ?? ''}
        />
      ))}
    </ul>
  )
}
