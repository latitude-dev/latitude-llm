import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
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

export default function QualityMetricChart<
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

  const qualityMetric = evaluation.qualityMetric
  const confusionMatrix = evaluation.qualityMetricMetadata?.confusionMatrix

  const qualityMetricLink =
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid }).issues.root +
    `?issueId=${issue?.id}`

  return (
    <ChartWrapper
      label='Quality'
      tooltip={
        <ConfusionMatrixTooltipContent confusionMatrix={confusionMatrix} />
      }
      loading={isLoading}
    >
      {qualityMetric !== undefined && qualityMetric !== null ? (
        <div className='flex flex-row items-center gap-1'>
          <PanelChart data={`${Math.round(qualityMetric)}%`} />

          <Link href={qualityMetricLink} target='_blank'>
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
        <ChartBlankSlate>No quality metric available</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
