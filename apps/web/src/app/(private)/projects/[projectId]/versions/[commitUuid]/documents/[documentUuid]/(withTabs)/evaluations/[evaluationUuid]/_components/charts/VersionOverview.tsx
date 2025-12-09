import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import { formatCount } from '@latitude-data/constants/formatCount'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ChartWrapper,
  ScatterChart,
} from '@latitude-data/web-ui/molecules/Charts'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { cn } from '@latitude-data/web-ui/utils'
import { useMemo } from 'react'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { EvaluationV2Stats } from '@latitude-data/core/schema/types'

export default function VersionOverviewChart<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ stats, isLoading }: { stats?: EvaluationV2Stats; isLoading?: boolean }) {
  const { commit } = useCurrentCommit()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  const configuration = metricSpecification.chartConfiguration({ evaluation })

  const data = useMemo(() => {
    return (
      stats?.versionOverview.map((point) => ({
        ...point,
        x: point.totalResults,
        y: Number(configuration.scale(point.averageScore).toFixed(2)),
        size: commit.id === point.version.id ? 10 : 5,
        color:
          commit.id === point.version.id
            ? 'hsl(var(--primary))'
            : 'hsl(var(--muted-foreground))',
      })) || []
    )
  }, [stats, commit.id, configuration])

  const minY = useMemo(() => {
    const min = data.reduce((min, point) => Math.min(min, point.y), Infinity)
    if (configuration.min === -Infinity) return Math.floor(min * 0.9)
    return Math.min(configuration.min, min)
  }, [data, configuration])
  const maxY = useMemo(() => {
    const max = data.reduce((max, point) => Math.max(max, point.y), -Infinity)
    if (configuration.max === Infinity) return Math.ceil(max * 1.1)
    return Math.max(configuration.max, max)
  }, [data, configuration])

  return (
    <ChartWrapper
      label='Results over versions'
      tooltip={`The overview (${evaluation.configuration.reverseScale ? 'lower' : 'higher'} is better) of results per version for this evaluation`}
      className={cn({ 'pb-4': isLoading, 'pb-0': !isLoading })}
      loading={isLoading}
    >
      {data.length > 0 ? (
        <ScatterChart
          config={{
            xAxis: {
              label: 'Evaluation results',
              legend: 'results',
              type: 'number',
              min: data.at(0)?.x ?? 0,
              max: data.at(-1)?.x ?? 0,
              tickFormatter: (count) => formatCount(Number(count)),
            },
            yAxis: {
              label: 'Average score',
              legend: 'average score',
              type: 'number',
              min: minY,
              max: maxY,
              thresholds: configuration.thresholds,
              tickFormatter: (score) =>
                configuration.format(Number(score), true),
            },
            data: data,
            // @ts-expect-error typescript cannot infer the type from [key: string]: any
            tooltipLabel: (point: (typeof data)[number]) => {
              return (
                <div className='flex flex-row gap-2 items-center w-full'>
                  <Badge variant={point.version.mergedAt ? 'accent' : 'muted'}>
                    <Text.H6 noWrap>
                      {point.version.mergedAt
                        ? `v${point.version.version}`
                        : 'Draft'}
                    </Text.H6>
                  </Badge>
                  <Text.H5 noWrap>{point.version.title}</Text.H5>
                </div>
              )
            },
            // @ts-expect-error typescript cannot infer the type from [key: string]: any
            tooltipContent: (point: (typeof data)[number]) => {
              return (
                <div className='flex flex-col gap-2 w-full'>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Average score</Text.H6B>
                    <Text.H6>
                      {configuration.format(
                        Number(
                          configuration.scale(point.averageScore).toFixed(2),
                        ),
                      )}
                    </Text.H6>
                  </div>
                  {evaluation.type === EvaluationType.Llm && (
                    <>
                      <div className='flex w-full gap-2 justify-between'>
                        <Text.H6B>Total cost</Text.H6B>
                        <Text.H6>
                          {formatCostInMillicents(point.totalCost)}
                        </Text.H6>
                      </div>
                      <div className='flex w-full gap-2 justify-between'>
                        <Text.H6B>Total tokens</Text.H6B>
                        <Text.H6>{formatCount(point.totalTokens)}</Text.H6>
                      </div>
                    </>
                  )}
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Total results</Text.H6B>
                    <Text.H6>{formatCount(point.totalResults)}</Text.H6>
                  </div>
                </div>
              )
            },
          }}
        />
      ) : (
        <ChartBlankSlate>No logs evaluated so far</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
