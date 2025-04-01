import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2Stats,
} from '@latitude-data/core/browser'
import { ChartWrapper } from '@latitude-data/web-ui/molecules/Charts'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import { PanelChart } from '@latitude-data/web-ui/molecules/Charts'
import { useMemo } from 'react'

export default function AverageScoreChart<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({ stats, isLoading }: { stats?: EvaluationV2Stats; isLoading: boolean }) {
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  const configuration = metricSpecification.chartConfiguration({ evaluation })

  const averageScore = Number(
    configuration.scale(stats?.averageScore ?? 0).toFixed(2),
  )

  const color = useMemo(() => {
    const color = 'successMutedForeground'

    if (
      (configuration.thresholds.lower &&
        averageScore < configuration.thresholds.lower) ||
      (configuration.thresholds.upper &&
        averageScore > configuration.thresholds.upper)
    ) {
      return 'destructiveMutedForeground'
    }

    return color
  }, [averageScore, configuration])

  return (
    <ChartWrapper
      label='Average score'
      tooltip={`The average score (${evaluation.configuration.reverseScale ? 'lower' : 'higher'} is better) of results for this evaluation`}
      loading={isLoading}
    >
      {stats?.averageScore !== undefined ? (
        <PanelChart
          asChild
          data={
            <Text.H3B color={color}>
              {configuration.format(averageScore)}
            </Text.H3B>
          }
        />
      ) : (
        <ChartBlankSlate>No logs evaluated so far</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
