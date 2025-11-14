import { cn } from '@latitude-data/web-ui/utils'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TruncatedTooltip } from '@latitude-data/web-ui/molecules/TruncatedTooltip'
import { DocumentChangeSkeleton } from '@latitude-data/web-ui/molecules/DocumentChange'
import { useCurrentTheme } from '$/hooks/useCurrentTheme'
import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'
import {
  ChangedEvaluation,
  type CommitChanges,
  ModifiedDocumentType,
} from '@latitude-data/constants'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import useDocumentVersions from '$/stores/documentVersions'
import { CurrentTheme } from '@latitude-data/web-ui/constants'
import { TextColor } from '@latitude-data/web-ui/tokens'

function useEvaluationsFromChanges({
  changes,
}: {
  changes: ChangedEvaluation[]
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const commitUuid = commit.uuid
  const projectId = project.id
  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({ projectId, commitUuid })

  const isLoading = isLoadingDocuments

  return useMemo(() => {
    if (isLoading) return

    return changes.map((change) => {
      const document = documents.find(
        (d) => d.documentUuid === change.documentUuid,
      )
      const documentName = document
        ? (document?.path?.split('/')?.at(-1) ?? '')
        : ''
      const isDeleted = change.changeType === ModifiedDocumentType.Deleted
      return {
        uuid: change.evaluationUuid,
        name: change.name,
        documentName,
        type: change.type,
        changeType: change.changeType,
        hasIssues: change.hasIssues,
        url: !isDeleted
          ? ROUTES.projects
              .detail({ id: projectId })
              .commits.detail({ uuid: commitUuid })
              .documents.detail({ uuid: change.documentUuid }).root
          : undefined,
      }
    })
  }, [isLoading, changes, documents, projectId, commitUuid])
}

function EvaluationItem({
  theme,
  name,
  documentName,
  url,
  itemType,
  changeType,
}: {
  name: string
  documentName: string
  itemType: 'changed' | 'withIssues'
  theme: CurrentTheme
  changeType: ModifiedDocumentType
  url?: string
}) {
  const changeIcon = useMemo<IconName>(() => {
    switch (changeType) {
      case ModifiedDocumentType.Created:
        return 'addSquare'
      case ModifiedDocumentType.Deleted:
        return 'deletion'
      case ModifiedDocumentType.Updated:
      default:
        return 'modification'
    }
  }, [changeType])

  const changeColor = useMemo<TextColor>(() => {
    switch (changeType) {
      case ModifiedDocumentType.Created:
        return 'success'
      case ModifiedDocumentType.Deleted:
        return 'destructiveMutedForeground'
      case ModifiedDocumentType.Updated:
      default:
        return 'accentForeground'
    }
  }, [changeType])

  const textColor = useMemo<TextColor>(() => {
    if (itemType === 'withIssues') return 'destructive'
    return 'foreground'
  }, [itemType])

  return (
    <div
      className={cn(
        'w-full flex flex-row items-center justify-between gap-2 min-h-8 px-2 rounded-md',
        {
          'hover:bg-accent cursor-pointer': !!url,
        },
      )}
    >
      <div className='flex flex-row items-center gap-2 min-w-0 flex-1'>
        <Icon name={changeIcon} className={cn('flex-shrink-0', changeColor)} />
        {itemType === 'withIssues' && (
          <Icon
            name='alert'
            className='flex-shrink-0 text-destructive-muted-foreground'
          />
        )}
        <div className='flex flex-col min-w-0 flex-1'>
          <TruncatedTooltip content={name}>
            <Text.H5
              color={textColor}
              display='block'
              ellipsis
              noWrap
              underline={!!url}
              darkColor={itemType === 'withIssues' ? 'white' : undefined}
              theme={theme}
            >
              {name}
            </Text.H5>
          </TruncatedTooltip>
          {documentName && (
            <Text.H6
              color='foregroundMuted'
              display='block'
              ellipsis
              noWrap
              theme={theme}
            >
              {documentName}
            </Text.H6>
          )}
        </div>
      </div>
    </div>
  )
}

function EvaluationsWithIssues({
  changes,
  theme,
}: {
  changes: ChangedEvaluation[]
  theme: CurrentTheme
}) {
  const evaluations = useEvaluationsFromChanges({ changes })
  if (!evaluations) return null
  if (!evaluations.length) return null

  return (
    <>
      {evaluations.map((evaluation, idx) => (
        <div key={evaluation.uuid} className={cn({ 'pt-2': idx !== 0 })}>
          <EvaluationItem
            theme={theme}
            name={evaluation.name}
            documentName={evaluation.documentName}
            url={evaluation.url}
            itemType='withIssues'
            changeType={evaluation.changeType}
          />
        </div>
      ))}
    </>
  )
}

export function CleanEvaluations({
  changes,
  theme,
}: {
  changes: ChangedEvaluation[]
  theme: CurrentTheme
}) {
  const evaluations = useEvaluationsFromChanges({ changes })
  if (!evaluations) return null
  if (!evaluations.length) return null

  return (
    <>
      {evaluations.map((evaluation, idx) => (
        <div key={evaluation.uuid} className={cn({ 'pt-2': idx !== 0 })}>
          <EvaluationItem
            theme={theme}
            name={evaluation.name}
            documentName={evaluation.documentName}
            url={evaluation.url}
            itemType='changed'
            changeType={evaluation.changeType}
          />
        </div>
      ))}
    </>
  )
}

export function EvaluationChangesList({
  isLoading,
  changes,
}: {
  isLoading: boolean
  changes: CommitChanges
}) {
  const evaluationChanges = changes.evaluations
  const hasIssues = evaluationChanges.hasIssues
  const theme = useCurrentTheme()
  const allEvaluations = evaluationChanges?.all ?? []
  const evaluationsWithIssues = evaluationChanges?.withIssues ?? []
  const cleanEvaluations = evaluationChanges?.clean ?? []

  return (
    <div className='flex flex-col gap-y-1'>
      <Text.H5M>Evaluation Changes</Text.H5M>
      <ul
        className={cn(
          'min-w-0 flex flex-col border rounded-md custom-scrollbar p-1',
          'gap-y-2 divide-y divide-border overflow-y-auto',
          {
            'border-destructive dark:border-foreground': hasIssues,
            'border-border': !hasIssues,
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
            {!allEvaluations.length ? (
              <div className='p-2'>
                <Text.H5M color='foregroundMuted'>No changes</Text.H5M>
              </div>
            ) : null}
            <EvaluationsWithIssues
              changes={evaluationsWithIssues}
              theme={theme}
            />
            <CleanEvaluations changes={cleanEvaluations} theme={theme} />
          </>
        )}
      </ul>
    </div>
  )
}
