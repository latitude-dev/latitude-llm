import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useIssue } from '$/stores/issues/issue'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ChartWrapper,
  PanelChart,
} from '@latitude-data/web-ui/molecules/Charts'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'

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

  return (
    <ChartWrapper
      label='Quality metric'
      tooltip='When an evaluation is linked to an issue, we use the Matthews Correlation Coefficient (MCC) to calculate how well the evaluation matches the issue'
      loading={isLoading}
    >
      {qualityMetric !== undefined && qualityMetric !== null ? (
        <div className='flex flex-col'>
          {issue && (
            <div className='flex items-center gap-1.5 min-w-0'>
              <Icon name='shieldAlert' size='large' color='foregroundMuted' />
              <Text.H6 color='foregroundMuted' noWrap ellipsis>
                {issue.title}
              </Text.H6>
            </div>
          )}
          <PanelChart data={`${Math.round(qualityMetric)}%`} />
        </div>
      ) : !issue ? (
        <ChartBlankSlate>No issue linked to this evaluation</ChartBlankSlate>
      ) : (
        <ChartBlankSlate>No quality metric available</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
