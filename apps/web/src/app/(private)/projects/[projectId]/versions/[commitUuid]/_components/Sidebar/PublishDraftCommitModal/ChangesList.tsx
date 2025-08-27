import { Commit } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
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

export function ChangesList({
  anyChanges,
  selected,
  onSelect,
  projectId,
  commit,
  changes,
  isLoading,
  onClose,
}: {
  anyChanges: boolean
  selected?: ChangedDocument
  onSelect: ReactStateDispatch<ChangedDocument | undefined>
  commit: Commit | undefined
  changes: CommitChanges
  projectId: number
  isLoading: boolean
  onClose: ReactStateDispatch<number | null>
}) {
  const hasErrors = !isLoading && changes?.documents?.hasErrors
  const allDocuments = changes?.documents?.all ?? []
  const erroredDocuments = changes?.documents?.errors ?? []
  const cleanDocuments = changes?.documents?.clean ?? []

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
