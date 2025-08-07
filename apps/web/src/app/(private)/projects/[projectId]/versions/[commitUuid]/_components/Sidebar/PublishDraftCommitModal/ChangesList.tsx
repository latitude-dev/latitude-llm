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
import { ChangedDocument, ModifiedDocumentType } from '@latitude-data/constants'

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
    <li className='w-full flex flex-row items-center justify-between gap-1 min-h-8 px-2'>
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
    </li>
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
    <li>
      <DocumentChange
        path={change.path}
        changeType={change.changeType}
        oldPath={prevDocument?.path}
        isSelected={isSelected}
        onClick={onSelect}
      />
    </li>
  )
}

export type GroupedChanges = Record<'errors' | 'clean', ChangedDocument[]>
export function ChangesList({
  anyChanges,
  selected,
  onSelect,
  commit,
  projectId,
  isLoading,
  groups,
  hasErrors,
  onClose,
}: {
  anyChanges: boolean
  selected?: ChangedDocument
  onSelect: ReactStateDispatch<ChangedDocument | undefined>
  commit: Commit | undefined
  projectId: number
  isLoading: boolean
  groups: GroupedChanges
  hasErrors: boolean
  onClose: ReactStateDispatch<number | null>
}) {
  const bothGroups = groups.errors.length > 0 && groups.clean.length > 0
  return (
    <div
      className={cn('overflow-hidden h-full', {
        'flex flex-col gap-y-1': !isLoading && anyChanges,
        hidden: !isLoading && !anyChanges,
      })}
    >
      <Text.H5M>Changes</Text.H5M>
      <ul
        className={cn(
          'min-w-0 flex flex-col border rounded-md custom-scrollbar h-56 p-1',
          {
            'border-border': !hasErrors,
            'border-destructive dark:border-foreground': hasErrors,
          },
        )}
      >
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
            {groups.errors.map((c) => (
              <ChangeWithErrors
                key={c.documentUuid}
                change={c}
                projectId={projectId}
                commit={commit}
                onClose={onClose}
              />
            ))}

            {bothGroups ? (
              <div className='py-2 h-px w-full flex items-center'>
                <div className='w-full h-px bg-border' />
              </div>
            ) : null}

            {groups.clean.map((c) => (
              <Change
                key={c.documentUuid}
                change={c}
                isSelected={selected?.documentUuid === c.documentUuid}
                onSelect={() => onSelect(c)}
              />
            ))}
          </>
        )}
      </ul>
    </div>
  )
}
