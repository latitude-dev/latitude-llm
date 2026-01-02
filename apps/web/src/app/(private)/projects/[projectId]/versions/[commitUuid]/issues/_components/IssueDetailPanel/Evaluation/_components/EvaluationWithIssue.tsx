import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import {
  AlignmentMetricMetadata,
  EvaluationV2,
} from '@latitude-data/core/constants'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ConfusionMatrixTooltipContent } from '$/components/ConfusionMatrix'
import { calculateMCC } from '$/helpers/evaluation-generation/calculateMCC'
import { useCallback, useState } from 'react'

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

  const [alignmentMetricMetadata, setAlignmentMetricMetadata] = useState<
    AlignmentMetricMetadata | undefined
  >(evaluationWithIssue.alignmentMetricMetadata ?? undefined)

  const confusionMatrix = alignmentMetricMetadata?.confusionMatrix
  const alignmentMetric = confusionMatrix
    ? calculateMCC({ confusionMatrix })
    : 0
  const isRecalculating = !!alignmentMetricMetadata?.recalculatingAt

  const onAlignmentMetricUpdated = useCallback(
    (args: EventArgs<'evaluationV2AlignmentMetricUpdated'>) => {
      if (!args || args.evaluationUuid !== evaluationWithIssue.uuid) return
      setAlignmentMetricMetadata(args.alignmentMetricMetadata)
    },
    [evaluationWithIssue.uuid],
  )
  useSockets({
    event: 'evaluationV2AlignmentMetricUpdated',
    onMessage: onAlignmentMetricUpdated,
  })

  return (
    <div className='grid grid-cols-2 gap-x-4 gap-y-4 items-center'>
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
      <div className='flex flex-row items-center gap-1'>
        <Icon name='cornerDownRight' size='small' color='foregroundMuted' />
        <Text.H5 color='foregroundMuted'>Alignment</Text.H5>
        <Tooltip
          align='center'
          side='bottom'
          trigger={<Icon name='info' color='foregroundMuted' size='small' />}
        >
          <ConfusionMatrixTooltipContent confusionMatrix={confusionMatrix} />
        </Tooltip>
      </div>
      {isRecalculating ? (
        <div className='flex flex-row items-center gap-2'>
          <Icon name='loader' spin color='foregroundMuted' size='small' />
          <Text.H5 color='foregroundMuted'>Recalculating...</Text.H5>
        </div>
      ) : (
        <Text.H5 color='foreground'>{alignmentMetric}%</Text.H5>
      )}
    </div>
  )
}
