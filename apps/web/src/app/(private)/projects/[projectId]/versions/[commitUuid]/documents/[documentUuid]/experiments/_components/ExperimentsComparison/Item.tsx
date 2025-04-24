import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  ExperimentDto,
  ExperimentWithScores,
} from '@latitude-data/core/browser'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useMemo } from 'react'
import { EvaluationWithBestExperiment } from '$/stores/experimentComparison'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import { Button } from '@latitude-data/web-ui/atoms/Button'

function ExperimentPrompt({
  experiment,
}: {
  experiment: ExperimentDto | undefined
}) {
  return (
    <div
      className={cn(
        'w-full max-h-40 min-h-40 bg-secondary p-4 rounded-lg flex flex-col gap-2',
        {
          'overflow-hidden': !experiment?.metadata?.prompt,
          'overflow-auto custom-scrollbar': experiment?.metadata?.prompt,
        },
      )}
    >
      <Text.H5B color='foregroundMuted'>Prompt</Text.H5B>
      <div className='flex flex-col gap-1'>
        {experiment?.metadata?.prompt ? (
          experiment.metadata.prompt.split('\n').map((line, index) => (
            <Text.H6 monospace key={index} color='foregroundMuted'>
              {line}
            </Text.H6>
          ))
        ) : (
          <>
            <Skeleton height='h6' className='w-[20%]' />
            <Skeleton height='h6' className='w-[60%]' />
            <Skeleton height='h6' className='w-[70%]' />
            <Skeleton height='h6' className='w-[65%]' />
            <Skeleton height='h6' className='w-[20%] mb-4' />
            <Skeleton height='h6' className='w-[85%]' />
            <Skeleton height='h6' className='w-[30%]' />
          </>
        )}
      </div>
    </div>
  )
}

export function ExperimentItemPlaceholder({
  isLast,
  evaluationCount,
}: {
  isLast?: boolean
  evaluationCount?: number
}) {
  return (
    <div
      className={cn(
        'w-full max-w-[40%] min-w-80 min-h-40 flex flex-col gap-4 p-4 border-border',
        {
          'border-r': !isLast,
        },
      )}
    >
      <Skeleton height='h4' className='w-[85%]' />
      <ExperimentPrompt experiment={undefined} />
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
    </div>
  )
}

export function ExperimentItem({
  experiment,
  evaluations,
  isLast,
  onUnselect,
}: {
  experiment?: ExperimentWithScores
  evaluations?: EvaluationWithBestExperiment[]
  isLast: boolean
  onUnselect?: () => void
}) {
  if (!experiment) {
    return (
      <ExperimentItemPlaceholder
        isLast={isLast}
        evaluationCount={evaluations?.length}
      />
    )
  }

  return (
    <div
      className={cn(
        'w-full max-w-[40%] min-w-80 min-h-40 flex flex-col gap-4 p-4 border-border',
        {
          'border-r': !isLast,
        },
      )}
    >
      <div className='flex flex-row w-full items-center justify-between gap-4'>
        <Text.H4B ellipsis noWrap>
          {experiment.name}
        </Text.H4B>
        {onUnselect && (
          <Button
            iconProps={{
              name: 'close',
              color: 'foregroundMuted',
            }}
            onClick={onUnselect}
            variant='ghost'
            className='p-0'
          />
        )}
      </div>
      <ExperimentPrompt experiment={experiment} />
      <div className='flex flex-col gap-2'>
        {evaluations?.map((evaluation) => (
          <EvaluationItem
            key={evaluation.uuid}
            experiment={experiment}
            evaluation={evaluation}
          />
        ))}
      </div>
    </div>
  )
}

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
    <Text.H6 color={color} animate={loading}>
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

  const { bgColor, fgColor } = useMemo<{
    bgColor: string
    fgColor: TextColor
  }>(() => {
    if (!isIncluded) {
      return {
        bgColor: '',
        fgColor: 'foregroundMuted',
      }
    }

    const isBest = evaluation.bestExperimentUuids.includes(experiment.uuid)
    const hasTied = isBest && evaluation.bestExperimentUuids.length > 1

    if (hasTied) {
      return {
        bgColor: 'bg-muted',
        fgColor: 'foreground',
      }
    }

    if (isBest) {
      return {
        bgColor: 'bg-accent',
        fgColor: 'accentForeground',
      }
    }

    return {
      bgColor: '',
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
        bgColor,
      )}
    >
      <Text.H6 color={fgColor}>{evaluation.name}</Text.H6>
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
