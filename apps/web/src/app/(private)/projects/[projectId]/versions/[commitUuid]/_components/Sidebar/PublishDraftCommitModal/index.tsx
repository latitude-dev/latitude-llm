import { useEffect, useMemo, useState } from 'react'

import {
  Commit,
  CommitStatus,
  ModifiedDocumentType,
} from '@latitude-data/core/browser'
import { ChangedDocument } from '@latitude-data/core/repositories'
import {
  cn,
  colors,
  ConfirmModal,
  Icon,
  IconName,
  ReactStateDispatch,
  Skeleton,
  Text,
  useCurrentProject,
  useToast,
  type TextColor,
} from '@latitude-data/web-ui'
import { getChangedDocumentsInDraftAction } from '$/actions/commits/getChangedDocumentsInDraftAction'
import { useCurrentTheme } from '$/hooks/useCurrentTheme'
import { ROUTES } from '$/services/routes'
import { useCommits } from '$/stores/commitsStore'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useServerAction } from 'zsa-react'

const MODIFICATION_ICONS = {
  [ModifiedDocumentType.Created]: 'addSquare',
  [ModifiedDocumentType.Updated]: 'modification',
  [ModifiedDocumentType.Deleted]: 'deletion',
}
const MODIFICATION_COLORS: Record<ModifiedDocumentType, TextColor> = {
  [ModifiedDocumentType.Created]: 'accentForeground',
  [ModifiedDocumentType.Updated]: 'warningMutedForeground',
  [ModifiedDocumentType.Deleted]: 'destructive',
}
function LoadingFile({
  changeType,
  width,
}: {
  changeType: ModifiedDocumentType
  width: number
}) {
  const icon = MODIFICATION_ICONS[changeType]
  return (
    <li className='w-full flex flex-row items-center gap-x-1 min-h-8'>
      <Icon
        name={icon as IconName}
        className='flex-shrink-0 w-4 h-4 text-gray-400 animate-pulse'
      />
      <div className='flex-grow h-5'>
        <Skeleton
          className={'h-full bg-muted rounded-full'}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  )
}

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
    <li className='w-full flex flex-row items-center justify-center gap-x-1 min-h-8'>
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
          <Text.H5
            underline
            display='block'
            ellipsis
            noWrap
            color='destructive'
            darkColor='white'
            theme={theme}
          >
            {change.path}
          </Text.H5>
        </Link>
      </div>
    </li>
  )
}

function Change({
  change,
  hasErrors,
}: {
  change: ChangedDocument
  hasErrors: boolean
}) {
  const icon = MODIFICATION_ICONS[change.changeType]
  const color: TextColor = hasErrors
    ? 'foreground'
    : MODIFICATION_COLORS[change.changeType]
  return (
    <li
      className={cn(
        'flex flex-row items-center justify-center gap-x-1 min-h-8',
        {
          'opacity-100': !hasErrors,
          'opacity-50': hasErrors,
        },
      )}
    >
      <Icon
        name='file'
        className={cn('flex-shrink-0 w-4 h-4', colors.textColors[color])}
      />
      <div className='flex-grow truncate'>
        <Text.H5 display='block' ellipsis noWrap color={color}>
          {change.path}
        </Text.H5>
      </div>
      <Icon
        name={icon as IconName}
        className={cn('flex-shrink-0 w-4 h-4', colors.textColors[color])}
      />
    </li>
  )
}

type GroupedChanges = Record<'errors' | 'clean', ChangedDocument[]>
function ChangesList({
  anyChanges,
  commit,
  projectId,
  isLoading,
  groups,
  hasErrors,
  onClose,
}: {
  anyChanges: boolean
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
      className={cn('overflow-hidden', {
        'flex flex-col gap-y-1': anyChanges,
        hidden: !anyChanges,
      })}
    >
      <Text.H4>Changes</Text.H4>
      <ul
        className={cn(
          'min-w-0 flex flex-col border rounded-md p-2 custom-scrollbar max-h-56',
          {
            'border-border': !hasErrors,
            'border-destructive dark:border-foreground': hasErrors,
          },
        )}
      >
        {isLoading ? (
          <>
            <LoadingFile width={62} changeType={ModifiedDocumentType.Deleted} />
            <LoadingFile width={87} changeType={ModifiedDocumentType.Updated} />
            <LoadingFile width={23} changeType={ModifiedDocumentType.Created} />
            <LoadingFile width={67} changeType={ModifiedDocumentType.Updated} />
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
              <Change key={c.documentUuid} hasErrors={hasErrors} change={c} />
            ))}
          </>
        )}
      </ul>
    </div>
  )
}

function confirmDescription({
  isLoading,
  anyChanges,
  hasErrors,
}: {
  anyChanges: boolean
  hasErrors: boolean
  isLoading: boolean
}) {
  if (isLoading) return undefined
  if (!anyChanges) return 'No changes to publish.'

  if (hasErrors)
    return 'Some documents has errors, please click on those documents to see the errors.'
  return 'Publishing a new version will update all your prompts in production.'
}

export default function PublishDraftCommitModal({
  commitId,
  onClose,
}: {
  commitId: number | null
  onClose: ReactStateDispatch<number | null>
}) {
  const { toast } = useToast()
  const { data, publishDraft, isPublishing } = useCommits({
    commitStatus: CommitStatus.Draft,
    onSuccessPublish: () => {
      router.push(ROUTES.projects.detail({ id: project.id }).commits.latest)

      toast({
        title: 'Success',
        description: 'Project published successfully.',
      })

      onClose(null)
    },
  })
  const commit = useMemo(() => data.find((c) => c.id === commitId), [commitId])
  const { project } = useCurrentProject()
  const router = useRouter()
  const {
    data: changes = [],
    execute: getChanges,
    isPending: isLoading,
  } = useServerAction(getChangedDocumentsInDraftAction)
  const [groups, setGroups] = useState<GroupedChanges>({
    errors: [],
    clean: [],
  })

  useEffect(() => {
    async function load() {
      if (!commitId) return

      const [data, error] = await getChanges({
        projectId: project.id,
        id: commitId,
      })

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
        return
      }

      setGroups(
        data.reduce(
          (acc, c) => {
            acc[c.errors > 0 ? 'errors' : 'clean'].push(c)
            return acc
          },
          {
            errors: [] as ChangedDocument[],
            clean: [] as ChangedDocument[],
          } as GroupedChanges,
        ),
      )
    }

    load()
  }, [commitId, project.id])
  const anyChanges = changes.length > 0
  const hasErrors = !anyChanges || groups.errors.length > 0
  return (
    <ConfirmModal
      dismissible={!isPublishing}
      type={!isLoading && hasErrors ? 'destructive' : 'default'}
      open={!!commit}
      title='Publish new version'
      description='Publishing the version will publish all changes in your prompts to production. Review the changes carefully before publishing.'
      onOpenChange={() => onClose(null)}
      onConfirm={() => publishDraft({ projectId: project.id, id: commitId! })}
      confirm={{
        label: isLoading ? 'Validating...' : 'Publish to production',
        description: confirmDescription({ isLoading, anyChanges, hasErrors }),
        disabled: isLoading || hasErrors,
        isConfirming: isPublishing,
      }}
    >
      <ChangesList
        anyChanges={anyChanges}
        commit={commit}
        projectId={project.id}
        isLoading={isLoading}
        groups={groups}
        hasErrors={!isLoading && hasErrors}
        onClose={onClose}
      />
    </ConfirmModal>
  )
}
