import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import { EvaluationWithBestExperiment } from '$/stores/experimentComparison'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  ExperimentWithScores,
} from '@latitude-data/core/browser'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { useMemo } from 'react'

function EvaluationScore<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  value,
  color,
  loading,
}: {
  evaluation: EvaluationV2<T, M>
  value: number
  color: TextColor
  loading: boolean
}) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  const configuration = metricSpecification.chartConfiguration({ evaluation })

  const averageScore = Number(configuration.scale(value).toFixed(2))

  return (
    <Text.H6 color={color} animate={loading} noWrap>
      {configuration.format(averageScore)}
    </Text.H6>
  )
}

function EvaluationItem({
  experiment,
  evaluation,
}: {
  experiment: ExperimentWithScores
  evaluation: EvaluationWithBestExperiment
}) {
  const isIncluded = useMemo(
    () => experiment.evaluationUuids.includes(evaluation.uuid),
    [experiment, evaluation.uuid],
  )

  const { bgClass, fgColor } = useMemo<{
    bgClass: string
    fgColor: TextColor
  }>(() => {
    if (!isIncluded) {
      return {
        bgClass: '',
        fgColor: 'foregroundMuted',
      }
    }

    const isBest = evaluation.bestExperimentUuids.includes(experiment.uuid)
    const hasTied = isBest && evaluation.bestExperimentUuids.length > 1

    if (hasTied) {
      return {
        bgClass: 'bg-muted',
        fgColor: 'foreground',
      }
    }

    if (isBest) {
      return {
        bgClass: 'bg-accent',
        fgColor: 'accentForeground',
      }
    }

    return {
      bgClass: '',
      fgColor: 'foreground',
    }
  }, [evaluation.bestExperimentUuids, experiment.uuid, isIncluded])

  const score = useMemo(() => {
    if (!experiment?.scores[evaluation.uuid]?.count) {
      return undefined
    }

    const values = experiment.scores[evaluation.uuid]!
    return values.totalScore / values.count
  }, [experiment, evaluation.uuid])

  return (
    <div
      className={cn(
        'flex flex-row w-full gap-2 items-center justify-between min-h-8 px-2 py-1 rounded-md',
        'transition-all ease-in duration-500',
        bgClass,
      )}
    >
      <Text.H6 color={fgColor} noWrap ellipsis>
        {evaluation.name}
      </Text.H6>
      {isIncluded ? (
        <EvaluationScore
          evaluation={evaluation}
          color={fgColor}
          value={score ?? 0}
          loading={!experiment.finishedAt}
        />
      ) : (
        <Text.H6 color={fgColor}>{'—'}</Text.H6>
      )}
    </div>
  )
}

export function ExperimentEvaluationScores({
  experiment,
  evaluations,
}: {
  experiment: ExperimentWithScores
  evaluations: EvaluationWithBestExperiment[] | undefined
}) {
  return (
    <div className='flex flex-col gap-2'>
      {evaluations?.map((evaluation) => (
        <EvaluationItem
          key={evaluation.uuid}
          experiment={experiment}
          evaluation={evaluation}
        />
      ))}
      {experiment.results.errors > 0 && (
        <div className='flex flex-row w-full gap-2 items-center justify-between min-h-8 px-2 py-1 rounded-md bg-destructive/10'>
          <Text.H6 color='destructive'>Total errors</Text.H6>
          <Text.H6 color='destructive'>{experiment.results.errors}</Text.H6>
        </div>
      )}
    </div>
  )
}

export function ExperimentEvaluationScoresPlaceholder({
  evaluationCount,
}: {
  evaluationCount?: number
}) {
  return (
    <div className='flex flex-col gap-2'>
      {new Array(evaluationCount || 3).fill(0).map((_, index) => (
        <div
          className={cn(
            'flex flex-row w-full gap-2 items-center justify-between min-h-8 px-2 py-1 rounded-md',
          )}
          key={index}
        >
          <Skeleton height='h6' className='w-full max-w-[60%]' />
          <Skeleton height='h6' className='w-12' />
        </div>
      ))}
    </div>
  )
}
