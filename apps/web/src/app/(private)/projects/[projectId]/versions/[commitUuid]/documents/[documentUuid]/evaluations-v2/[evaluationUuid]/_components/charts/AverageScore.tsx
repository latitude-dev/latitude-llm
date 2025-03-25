import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2Stats,
} from '@latitude-data/core/browser'
import {
  ChartBlankSlate,
  ChartWrapper,
  PanelChart,
  Text,
} from '@latitude-data/web-ui'
import { useMemo } from 'react'

export default function AverageScoreChart<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({ stats, isLoading }: { stats?: EvaluationV2Stats; isLoading: boolean }) {
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  const configuration = metricSpecification.chartConfiguration({ evaluation })

  const averageScore = configuration.scale(stats?.averageScore ?? 0)

  const color = useMemo(() => {
    if (configuration.thresholds.length === 0) {
      return 'successMutedForeground'
    }

    if (configuration.thresholds.length === 1) {
      return averageScore >= configuration.thresholds[0]!
        ? evaluation.configuration.reverseScale
          ? 'destructiveMutedForeground'
          : 'successMutedForeground'
        : evaluation.configuration.reverseScale
          ? 'successMutedForeground'
          : 'destructiveMutedForeground'
    }

    return averageScore >= configuration.thresholds[0]! &&
      averageScore <= configuration.thresholds[1]!
      ? 'successMutedForeground'
      : 'destructiveMutedForeground'
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
