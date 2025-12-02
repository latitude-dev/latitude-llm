import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'

type EvaluationWithIssueProps = {
  evaluationWithIssue: EvaluationV2
  evaluations: EvaluationV2[]
  issue: Issue
  isUpdatingEvaluation: boolean
  setIssueForNewEvaluation: (newEvaluationUuid: string) => void
}

export function EvaluationWithIssue({
  evaluationWithIssue,
  evaluations,
  issue,
  isUpdatingEvaluation,
  setIssueForNewEvaluation,
}: EvaluationWithIssueProps) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <div className='flex flex-row items-center gap-2'>
        <Select
          badgeLabel
          align='end'
          searchable
          side='bottom'
          removable
          name='evaluation'
          options={evaluations.map((e) => ({
            label: e.name,
            value: e.uuid,
            icon: <Icon name={getEvaluationMetricSpecification(e).icon} />,
          }))}
          value={evaluationWithIssue?.uuid}
          disabled={isUpdatingEvaluation}
          loading={isUpdatingEvaluation}
          onChange={setIssueForNewEvaluation}
        />
        <Link
          href={
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid })
              .documents.detail({ uuid: issue.documentUuid })
              .evaluations.detail({ uuid: evaluationWithIssue.uuid }).root
          }
          target='_blank'
        >
          <Icon
            name='externalLink'
            color='foregroundMuted'
            className='hover:text-primary'
          />
        </Link>
      </div>
    </div>
  )
}
