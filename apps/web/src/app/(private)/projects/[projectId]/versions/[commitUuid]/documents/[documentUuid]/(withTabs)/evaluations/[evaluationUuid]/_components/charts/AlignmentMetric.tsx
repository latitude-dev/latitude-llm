import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useAlignmentMetricUpdates } from '$/hooks/useAlignmentMetricUpdates'
import { useIssue } from '$/stores/issues/issue'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  ChartWrapper,
  PanelChart,
} from '@latitude-data/web-ui/molecules/Charts'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { ConfusionMatrixTooltipContent } from '$/components/ConfusionMatrix'

export default function AlignmentMetricChart<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ isLoading }: { isLoading?: boolean }) {
  const { evaluation } = useCurrentEvaluationV2<T, M>()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: issue } = useIssue({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId: evaluation.issueId,
  })

  const { confusionMatrix, alignmentMetric, isRecalculating } =
    useAlignmentMetricUpdates({
      evaluationUuid: evaluation.uuid,
      initialMetadata: evaluation.alignmentMetricMetadata,
    })

  const alignmentMetricLink =
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid }).issues.root +
    `?issueId=${issue?.id}`

  return (
    <ChartWrapper
      label='Alignment'
      tooltip={
        <ConfusionMatrixTooltipContent confusionMatrix={confusionMatrix} />
      }
      loading={isLoading}
    >
      {isRecalculating ? (
        <div className='flex flex-row items-center gap-2'>
          <Icon name='loader' spin color='foregroundMuted' size='normal' />
          <ChartBlankSlate>Recalculating...</ChartBlankSlate>
        </div>
      ) : alignmentMetric !== undefined ? (
        <div className='flex flex-row items-center gap-1'>
          <PanelChart data={`${alignmentMetric}%`} />

          <Link href={alignmentMetricLink} target='_blank'>
            <Icon
              name='externalLink'
              color='foregroundMuted'
              size='normal'
              className='hover:text-primary'
            />
          </Link>
        </div>
      ) : !issue ? (
        <ChartBlankSlate>No issue linked to this evaluation</ChartBlankSlate>
      ) : (
        <ChartBlankSlate>No alignment metric available</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
