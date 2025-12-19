import { useMemo } from 'react'
import { SerializedIssue } from '$/stores/issues'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { StatusBadges, useIssueStatuses } from '../IssueStatusBadge'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { getEvaluationTypeSpecification } from '$/components/evaluations'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

export function formatDocumentPath(path: string): string {
  const cleanPath = path.replace(/\.promptl$/, '')
  const segments = cleanPath.split('/')

  if (segments.length === 1) return segments[0]

  const filename = segments[segments.length - 1]
  const firstFolder = segments[0]

  if (segments.length === 2) {
    return `${firstFolder}/${filename}`
  }

  return `${firstFolder}/.../${filename}`
}

function DocumentPath({
  project,
  commit,
  issue,
}: {
  project: Project
  commit: Commit
  issue: SerializedIssue
}) {
  const { data: document } = useDocumentVersion({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: issue.documentUuid,
  })
  const path = useMemo(
    () => (document ? formatDocumentPath(document.path) : null),
    [document],
  )

  if (!path) return null

  return (
    <div className='flex flex-row items-center gap-x-1'>
      <Icon name='bot' />
      <Text.H5 color='foregroundMuted'>{path}</Text.H5>
    </div>
  )
}

export function IssuesTitle({
  project,
  commit,
  issue,
  evaluations,
}: {
  project: Project
  commit: Commit
  issue: SerializedIssue
  evaluations: EvaluationV2[]
}) {
  const statuses = useIssueStatuses({ issue })
  const evaluation = useMemo(
    () => evaluations.find((e) => e.issueId === issue.id),
    [evaluations, issue.id],
  )

  const typeSpec = evaluation
    ? getEvaluationTypeSpecification(evaluation)
    : null

  return (
    <div className='flex flex-col justify-start items-start gap-y-1 py-4'>
      <div className='flex flex-row items-center gap-x-1'>
        <Text.H5>{issue.title}</Text.H5>
        {evaluation ? (
          <Tooltip
            asChild
            trigger={
              <div className='flex flex-row items-center bg-primary-muted p-1 rounded-md'>
                <Icon name='wandSparkles' color='primary' size='small' />
              </div>
            }
          >
            Issue detection automated by an {typeSpec?.name} evaluation
          </Tooltip>
        ) : null}
      </div>
      <div className='flex items-center gap-x-2'>
        <StatusBadges statuses={statuses} />
        <DocumentPath project={project} commit={commit} issue={issue} />
      </div>
    </div>
  )
}
