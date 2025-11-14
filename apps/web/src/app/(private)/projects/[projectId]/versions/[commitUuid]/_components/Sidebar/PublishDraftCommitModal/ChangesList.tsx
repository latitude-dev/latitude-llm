import { cn } from '@latitude-data/web-ui/utils'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  DocumentChange,
  MODIFICATION_BACKGROUNDS,
  MODIFICATION_BACKGROUNDS_HOVER,
  MODIFICATION_COLORS,
  MODIFICATION_ICONS,
} from '@latitude-data/web-ui/molecules/DocumentChange'
import { TruncatedTooltip } from '@latitude-data/web-ui/molecules/TruncatedTooltip'
import { DocumentChangeSkeleton } from '@latitude-data/web-ui/molecules/DocumentChange'
import { useCurrentTheme } from '$/hooks/useCurrentTheme'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import useDocumentVersion from '$/stores/useDocumentVersion'
import {
  ChangedDocument,
  type CommitChanges,
  ModifiedDocumentType,
} from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useMemo } from 'react'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'

function ChangeWithErrors({
  change,
  projectId,
  commit,
  onClose,
}: {
  change: ChangedDocument
  commit: Commit | undefined
  projectId: number
  onClose: ReactStateDispatch<number | null>
}) {
  const theme = useCurrentTheme()
  return (
    <div className='w-full flex flex-row items-center justify-between gap-1 min-h-8 px-2'>
      <Icon
        name='alert'
        className='flex-shrink-0 text-destructive-muted-foreground'
      />
      <div className='flex-grow truncate'>
        <Link
          onClick={() => onClose(null)}
          href={
            ROUTES.projects
              .detail({ id: projectId })
              .commits.detail({ uuid: commit?.uuid! })
              .documents.detail({
                uuid: change.documentUuid,
              }).root
          }
        >
          <TruncatedTooltip content={change.path}>
            <Text.H5
              color='destructive'
              underline
              display='block'
              ellipsis
              noWrap
              darkColor='white'
              theme={theme}
            >
              {change.path}
            </Text.H5>
          </TruncatedTooltip>
        </Link>
      </div>
    </div>
  )
}

function Change({
  change,
  isSelected,
  onSelect,
}: {
  change: ChangedDocument
  isSelected: boolean
  onSelect: () => void
}) {
  const { data: prevDocument } = useDocumentVersion(
    change.changeType === ModifiedDocumentType.UpdatedPath
      ? change.documentUuid
      : null,
  )

  return (
    <DocumentChange
      path={change.path}
      changeType={change.changeType}
      oldPath={prevDocument?.path}
      isSelected={isSelected}
      onClick={onSelect}
    />
  )
}

export type GroupedChanges = Record<'errors' | 'clean', ChangedDocument[]>

function ChangeItem({
  changeType,
  hasErrors,
  label,
  icon,
  isSelected,
  onSelect,
  className,
}: {
  changeType: ModifiedDocumentType | undefined
  hasErrors: boolean
  label: string
  icon: IconName
  isSelected: boolean
  onSelect?: () => void
  className?: string
}) {
  const color = useMemo<TextColor>(() => {
    if (hasErrors) return 'destructive'
    if (changeType) return MODIFICATION_COLORS[changeType]
    return 'foregroundMuted'
  }, [hasErrors, changeType])

  return (
    <div
      className={cn(
        'flex flex-row items-center justify-between gap-1 min-h-8 px-2 rounded-md',
        {
          'cursor-pointer': !!onSelect,

          'bg-secondary': isSelected && !changeType,
          [MODIFICATION_BACKGROUNDS[changeType!]]: !!changeType && isSelected,

          'hover:bg-secondary': !isSelected && !changeType,
          [MODIFICATION_BACKGROUNDS_HOVER[changeType!]]:
            !!changeType && !isSelected,
        },
        className,
      )}
      onClick={onSelect}
    >
      <Icon name={icon} color={color} className='flex-shrink-0 w-4 h-4' />
      <div className='flex-grow truncate'>
        <Text.H5 underline={hasErrors} color={color}>
          {label}
        </Text.H5>
      </div>
      {changeType ? (
        <Icon
          name={MODIFICATION_ICONS[changeType]}
          color={MODIFICATION_COLORS[changeType]}
          className='flex-shrink-0 w-4 h-4'
        />
      ) : (
        <div className='flex-shrink-0 w-4 h-4' />
      )}
    </div>
  )
}

function DocumentChangeList({
  document,
  changes,
  selected,
  onSelect: onSelectDocument,
}: {
  document: DocumentVersion
  changes: CommitChanges
  selected?: ChangedDocument
  onSelect: ReactStateDispatch<ChangedDocument | undefined>
}) {
  const change = useMemo(() => {
    return changes.documents.all.find(
      (cd) => cd.documentUuid === document.documentUuid,
    )
  }, [changes.documents.all, document.documentUuid])

  const changedEvaluations = useMemo(
    () =>
      changes.evaluations.all.filter(
        (ce) => ce.documentUuid === document.documentUuid,
      ),
    [changes.evaluations.all, document.documentUuid],
  )

  const onSelect = useMemo(() => {
    if (!change) return undefined
    return () => onSelectDocument(change)
  }, [change, onSelectDocument])

  return (
    <li className='flex flex-col'>
      <ChangeItem
        changeType={change?.changeType}
        hasErrors={Boolean(change?.errors)}
        label={document.path}
        icon='bot'
        isSelected={selected?.documentUuid === document.documentUuid}
        onSelect={onSelect}
      />

      {changedEvaluations.map((ce) => (
        <ChangeItem
          className='pl-6'
          key={ce.evaluationUuid}
          changeType={ce.changeType}
          hasErrors={ce.hasIssues}
          label={ce.name}
          icon={EVALUATION_SPECIFICATIONS[ce.type].icon}
          isSelected={false}
        />
      ))}
    </li>
  )
}

export function ChangesList({
  anyChanges,
  selected,
  onSelect,
  projectId,
  commit,
  documents,
  changes,
  isLoading,
  onClose,
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
  const hasErrors = !isLoading && changes?.documents?.hasErrors
  const allDocuments = changes?.documents?.all ?? []
  const erroredDocuments = changes?.documents?.errors ?? []
  const cleanDocuments = changes?.documents?.clean ?? []

  const documentsList = useMemo(() => {
    if (isLoading) return []
    return documents.filter((d) => {
      if (
        changes.documents.all.some((cd) => cd.documentUuid === d.documentUuid)
      ) {
        return true
      }
      if (
        changes.evaluations.all.some((ce) => ce.documentUuid === d.documentUuid)
      ) {
        return true
      }
      return false
    })
  }, [isLoading, changes.documents.all, changes.evaluations.all, documents])

  if (isLoading) {
    // TODO: Add skeleton
    return <Text.H5M>Loading...</Text.H5M>
  }

  return (
    <ul className='flex flex-col gap-1'>
      {documentsList.map((d) => (
        <DocumentChangeList
          key={d.documentUuid}
          document={d}
          changes={changes}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )

  return (
    <div
      className={cn('overflow-hidden', {
        'flex flex-col gap-y-1': !isLoading && anyChanges,
        hidden: !isLoading && !anyChanges,
      })}
    >
      <Text.H5M>Prompt changes</Text.H5M>
      <ul
        className={cn(
          'min-w-0 flex flex-col border rounded-md custom-scrollbar p-1',
          'gap-y-2 divide-y divide-border overflow-y-auto',
          {
            'border-border': hasErrors,
            'border-destructive dark:border-foreground': hasErrors,
          },
        )}
      >
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
          <>
            {!allDocuments.length ? (
              <div className='p-2'>
                <Text.H5M color='foregroundMuted'>No changes</Text.H5M>
              </div>
            ) : null}
            {erroredDocuments.map((c, i) => (
              <li key={c.documentUuid} className={cn({ 'pt-2': i !== 0 })}>
                <ChangeWithErrors
                  change={c}
                  projectId={projectId}
                  commit={commit}
                  onClose={onClose}
                />
              </li>
            ))}

            {cleanDocuments.map((c, i) => (
              <li
                key={c.documentUuid}
                className={cn({
                  'pt-2': i !== 0 || erroredDocuments.length > 0,
                })}
              >
                <Change
                  change={c}
                  isSelected={selected?.documentUuid === c.documentUuid}
                  onSelect={() => onSelect(c)}
                />
              </li>
            ))}
          </>
        )}
      </ul>
    </div>
  )
}
