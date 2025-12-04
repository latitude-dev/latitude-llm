'use client'

import { memo, useMemo } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import {
  EvaluationConfiguration,
  EvaluationType,
  HumanEvaluationMetric,
  Run,
} from '@latitude-data/constants'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { getEvaluationMetricSpecification } from '$/components/evaluations'

export const RunsListItem = memo(
  ({
    run,
    isSelected,
    setSelectedRunUuid,
    timerNow,
  }: {
    run: Run
    isSelected: boolean
    setSelectedRunUuid: (uuid?: string) => void
    timerNow?: number
  }) => {
    const iconProps = useMemo<IconProps>(() => {
      if (run.span?.status === 'error') {
        return { name: 'circleX', color: 'destructive' }
      }

      const started = !!run.startedAt
      const ended = !!run.endedAt

      if (!started && !ended) {
        return {
          name: 'circleDashed',
          color: 'foregroundMuted',
          className: 'stroke-[2.25]',
        }
      }

      if (started && !ended) {
        return { name: 'loader', color: 'foregroundMuted', spin: true }
      }

      const annotations = run.annotations ?? []

      if (annotations.length === 0) {
        return { name: 'circleDashed', color: 'foregroundMuted' }
      }

      const uiAnnotations = annotations.filter((annotation) => {
        const evaluation = annotation.evaluation
        const supportManual =
          getEvaluationMetricSpecification(evaluation).supportsManualEvaluation

        if (!supportManual) return false

        const config = evaluation.configuration as EvaluationConfiguration<
          EvaluationType.Human,
          HumanEvaluationMetric
        >
        return config.enableControls === true
      })

      const uiAnnotation = uiAnnotations[0]

      if (!uiAnnotation) return { name: 'circleDashed', color: 'success' }

      const result = uiAnnotation.result
      return {
        name: result.hasPassed ? 'thumbsUp' : 'thumbsDown',
        color: result.hasPassed ? 'success' : 'destructive',
      }
    }, [run])
    return (
      <Tooltip
        asChild
        hideWhenEmpty
        align='center'
        side='left'
        delayDuration={750}
        trigger={
          <div
            className={cn(
              'w-full flex items-center justify-between gap-3 py-3 px-4',
              'bg-background hover:bg-secondary transition-colors',
              'cursor-pointer group relative',
              { 'bg-secondary': isSelected },
            )}
            onClick={() => {
              if (isSelected) setSelectedRunUuid(undefined)
              else setSelectedRunUuid(run.uuid)
            }}
          >
            <div className='min-w-0 min-h-8 flex items-center justify-start gap-2.5 truncate'>
              <Icon
                size='normal'
                name={iconProps.name}
                color={iconProps.color}
                spin={iconProps.spin}
                className={cn('flex-shrink-0', iconProps.className)}
              />
              <Text.H5
                color={
                  run.span?.status === 'error' ? 'destructive' : 'foreground'
                }
                animate={!run.endedAt}
                userSelect={false}
                noWrap
                ellipsis
              >
                {run.endedAt
                  ? run.span?.status === 'error'
                    ? run.span?.message ||
                      'An unknown error occurred while running the prompt'
                    : run.caption ||
                      'Run finished successfully without any response'
                  : run.startedAt
                    ? run.caption || 'Waiting for a response...'
                    : 'Waiting to get started...'}
              </Text.H5>
            </div>
            <div className='flex items-center justify-start gap-2'>
              {!!run.startedAt && (
                <Text.H5
                  color={
                    run.span?.status === 'error'
                      ? 'destructive'
                      : 'foregroundMuted'
                  }
                  userSelect={false}
                  noWrap
                  ellipsis
                >
                  {run.endedAt
                    ? relativeTime(new Date(run.endedAt))
                    : !!timerNow &&
                      formatDuration(
                        timerNow - new Date(run.startedAt).getTime(),
                        false,
                      )}
                </Text.H5>
              )}
              <Icon
                name='arrowRight'
                size='normal'
                color={
                  run.span?.status === 'error' ? 'destructive' : 'foreground'
                }
                className='flex-shrink-0'
              />
            </div>
          </div>
        }
      >
        {!!run.endedAt &&
          run.span?.status !== 'error' &&
          (run.annotations?.length
            ? 'This run has been reviewed'
            : 'Review pending for this run')}
      </Tooltip>
    )
  },
)
