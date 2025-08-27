import { cn } from '@latitude-data/web-ui/utils'
import { useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  ChangedTrigger,
  CommitChanges,
  DocumentTriggerType,
  ModifiedDocumentType,
} from '@latitude-data/constants'
import { useCurrentTheme } from '$/hooks/useCurrentTheme'
import useDocumentVersions from '$/stores/documentVersions'
import {
  DocumentChangeSkeleton,
  MODIFICATION_ICONS,
  MODIFICATION_COLORS,
} from '@latitude-data/web-ui/molecules/DocumentChange'
import useDocumentTriggers from '$/stores/documentTriggers'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { ROUTES } from '$/services/routes'
import { CurrentTheme } from '@latitude-data/web-ui/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

const TRIGGER_TYPE: Record<DocumentTriggerType, string> = {
  [DocumentTriggerType.Integration]: 'Integration',
  [DocumentTriggerType.Scheduled]: 'Scheduled',
  [DocumentTriggerType.Email]: 'Email',
  [DocumentTriggerType.Chat]: 'Chat',
}

function useTriggersFromChanges({ changes }: { changes: ChangedTrigger[] }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const commitUuid = commit.uuid
  const projectId = project.id
  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({ projectId, commitUuid })
  const { data: triggers, isLoading: isLoadingTriggers } = useDocumentTriggers({
    projectId,
    commitUuid,
  })

  const isLoading = isLoadingDocuments || isLoadingTriggers
  return useMemo(() => {
    if (isLoading) return

    const triggerUuids = new Set(triggers.map((c) => c.uuid))
    return changes
      .filter(
        (change) =>
          triggerUuids.has(change.triggerUuid) ||
          change.changeType === ModifiedDocumentType.Deleted,
      )
      .map((change) => {
        const document = documents.find(
          (d) => d.documentUuid === change.documentUuid,
        )
        const documentName = document
          ? (document?.path?.split('/')?.at(-1) ?? '')
          : ''
        const type = TRIGGER_TYPE[change.triggerType]
        const isDeleted = change.changeType === ModifiedDocumentType.Deleted
        return {
          uuid: change.triggerUuid,
          name: `${type} - ${documentName}`,
          changeType: change.changeType,
          url: !isDeleted
            ? ROUTES.projects
                .detail({ id: projectId })
                .commits.detail({ uuid: commitUuid }).preview.root
            : undefined,
        }
      })
  }, [isLoading, changes, triggers, documents, projectId, commitUuid])
}

function TriggerItem({
  theme,
  name,
  url,
  type,
  onClose,
  changeType,
}: {
  name: string
  type: 'changed' | 'pending'
  theme: CurrentTheme
  onClose?: ReactStateDispatch<number | null>
  changeType: ModifiedDocumentType
  url?: string
}) {
  const tooltip =
    type === 'pending'
      ? 'Pending trigger, click to finish configuration'
      : undefined
  const icon = MODIFICATION_ICONS[changeType]
  const color = MODIFICATION_COLORS[changeType]
  const nameComp = (
    <div className='flex flex-row items-center justify-between gap-x-2'>
      <Text.H5
        color={type === 'pending' ? 'latteInputForeground' : color}
        underline={type === 'pending'}
        display='block'
        ellipsis
        noWrap
        darkColor='white'
        theme={theme}
      >
        {name}
      </Text.H5>
      <Icon name={icon} color={color} className='flex-none' />
    </div>
  )
  return (
    <div
      className={cn(
        'w-full flex flex-row items-center justify-between gap-1 min-h-8 px-2 rounded-md',
        {
          'bg-latte-background': type === 'pending',
          'hover:bg-secondary': url,
        },
      )}
    >
      {type === 'pending' ? (
        <Icon
          name='alert'
          className='flex-shrink-0 text-latte-input-foreground'
        />
      ) : null}
      <div className='flex-grow truncate'>
        {url ? (
          <Link onClick={() => onClose?.(null)} href={url}>
            {tooltip ? (
              <Tooltip side='right' trigger={nameComp}>
                {tooltip}
              </Tooltip>
            ) : (
              nameComp
            )}
          </Link>
        ) : tooltip ? (
          <Tooltip side='right' trigger={nameComp}>
            {tooltip}
          </Tooltip>
        ) : (
          nameComp
        )}
      </div>
    </div>
  )
}

function PendingTriggers({
  changes,
  theme,
  onClose,
}: {
  onClose: ReactStateDispatch<number | null>
  changes: ChangedTrigger[]
  theme: CurrentTheme
}) {
  const triggers = useTriggersFromChanges({ changes })
  if (!triggers?.length) return null

  return (
    <li>
      {triggers.map((t) => (
        <TriggerItem
          key={t.uuid}
          name={t.name}
          url={t.url}
          theme={theme}
          type='pending'
          onClose={onClose}
          changeType={t.changeType}
        />
      ))}
    </li>
  )
}

export function CleanTriggers({
  changes,
  theme,
  onClose,
}: {
  onClose?: ReactStateDispatch<number | null>
  changes: ChangedTrigger[]
  theme: CurrentTheme
}) {
  const triggers = useTriggersFromChanges({ changes })
  if (!triggers?.length) return null

  return (
    <li>
      {triggers.map((t) => (
        <TriggerItem
          key={t.uuid}
          name={t.name}
          url={t.url}
          theme={theme}
          type='changed'
          onClose={onClose}
          changeType={t.changeType}
        />
      ))}
    </li>
  )
}

export function TriggerChangesList({
  isLoading,
  onClose,
  changes,
}: {
  isLoading: boolean
  onClose: ReactStateDispatch<number | null>
  changes: CommitChanges
}) {
  const triggerChanges = changes.triggers
  const hasPending = triggerChanges.hasPending
  const theme = useCurrentTheme()
  const allTriggers = triggerChanges?.all ?? []
  const pendingTriggers = triggerChanges?.pending ?? []
  const cleanTriggers = triggerChanges?.clean ?? []

  return (
    <div className='flex flex-col gap-y-1'>
      <Text.H5M>Trigger Changes</Text.H5M>
      <ul
        className={cn(
          'min-w-0 flex flex-col border rounded-md custom-scrollbar p-1',
          'gap-y-2 divide-y divide-border overflow-y-auto',
          {
            'border-border': hasPending,
            'border-latte-border dark:border-foreground': hasPending,
          },
        )}
      >
        {isLoading ? (
          <li>
            <DocumentChangeSkeleton
              width={62}
              changeType={ModifiedDocumentType.Updated}
            />
            <DocumentChangeSkeleton
              width={87}
              changeType={ModifiedDocumentType.Updated}
            />
            <DocumentChangeSkeleton
              width={23}
              changeType={ModifiedDocumentType.Updated}
            />
            <DocumentChangeSkeleton
              width={67}
              changeType={ModifiedDocumentType.Updated}
            />
          </li>
        ) : (
          <>
            {!allTriggers.length ? (
              <div className='p-2'>
                <Text.H5M color='foregroundMuted'>No changes</Text.H5M>
              </div>
            ) : null}
            <PendingTriggers
              changes={pendingTriggers}
              theme={theme}
              onClose={onClose}
            />
            <CleanTriggers
              changes={cleanTriggers}
              theme={theme}
              onClose={onClose}
            />
          </>
        )}
      </ul>
    </div>
  )
}
