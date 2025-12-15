import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { useTypeWriterValue } from '@latitude-data/web-ui/browser'
import { useMemo } from 'react'
import { ActiveEvaluation } from '@latitude-data/constants/evaluations'

type GeneratingEvaluationProps = {
  activeEvaluation: ActiveEvaluation | undefined
  endedEvaluation: { uuid: string | undefined; error: Error | undefined } | null
}

const GENERATION_DESCRIPTIONS = [
  'Thinking of a good configuration...',
  'Running validation tests...',
  'Evaluating alignment...',
  'Processing results...',
  'Optimizing further...',
]

export function GeneratingEvaluation({
  activeEvaluation,
  endedEvaluation,
}: GeneratingEvaluationProps) {
  const generationDescription = useTypeWriterValue(GENERATION_DESCRIPTIONS)

  const iconPropsByEvaluationStatus = useMemo<IconProps>(() => {
    const started = !!activeEvaluation?.startedAt
    const ended = !!activeEvaluation?.endedAt
    const error = !!activeEvaluation?.error

    if (error) {
      return {
        name: 'circleX',
        color: 'destructive',
      }
    }

    if (started && !ended) {
      return {
        name: 'loader',
        color: 'foregroundMuted',
        spin: true,
      }
    }
    if (ended) {
      return {
        name: 'checkClean',
        color: 'success',
      }
    }
    return {
      name: 'loader',
      color: 'primary',
      spin: true,
    }
  }, [
    activeEvaluation?.startedAt,
    activeEvaluation?.endedAt,
    activeEvaluation?.error,
  ])

  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <div className='flex flex-row items-center gap-2'>
        <Icon {...iconPropsByEvaluationStatus} />
        <div className='flex flex-col'>
          <Text.H6M>
            {activeEvaluation?.error
              ? 'Failed to generate'
              : activeEvaluation?.endedAt
                ? 'Finished successfully'
                : activeEvaluation?.startedAt
                  ? 'Generating...'
                  : endedEvaluation
                    ? 'Finalizing...'
                    : 'Preparing...'}
          </Text.H6M>
          <Text.H6 color='foregroundMuted'>
            {activeEvaluation?.error
              ? 'Please try again'
              : endedEvaluation
                ? 'Evaluation will appear shortly...'
                : generationDescription}
          </Text.H6>
        </div>
      </div>
    </div>
  )
}
