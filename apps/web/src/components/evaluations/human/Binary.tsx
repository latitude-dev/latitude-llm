import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationBinarySpecification,
  HumanEvaluationMetric,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { use, useCallback, useMemo, useState } from 'react'
import { CriteriaDescription as CriteriaWrapper } from '../Annotation/CriteriaDescription'
import {
  AnnotationFormWrapper as AForm,
  AnnotationContext,
} from '../Annotation/FormWrapper'
import { ThumbsUpDownInput } from '../Annotation/ThumbsUpDownInput'
import {
  AnnotationFormProps,
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import { useAnnotationFormState } from './useAnnotationForm'

const specification = HumanEvaluationBinarySpecification
export default {
  ...specification,
  icon: 'thumbsUp' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  AnnotationForm,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  return (
    <>
      <Input
        value={configuration.passDescription ?? ''}
        name='passDescription'
        label='Pass description'
        description='Additional guidelines describing when the response is acceptable'
        placeholder='The response promotes continued interaction'
        onChange={(e) =>
          setConfiguration({
            ...configuration,
            passDescription: e.target.value,
          })
        }
        errors={errors?.['passDescription']}
        className='w-full'
        disabled={disabled}
        required
      />
      <Input
        value={configuration.failDescription ?? ''}
        name='failDescription'
        label='Fail description'
        description='Additional guidelines describing when the response is not acceptable'
        placeholder='The response discourages interaction'
        onChange={(e) =>
          setConfiguration({
            ...configuration,
            failDescription: e.target.value,
          })
        }
        errors={errors?.['failDescription']}
        className='w-full'
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  return <>{result.score === 1 ? 'Passed' : 'Failed'}</>
}

function getCriteria(
  evaluation: EvaluationV2<EvaluationType.Human, HumanEvaluationMetric.Binary>,
) {
  const config = evaluation.configuration
  const criteria = config.criteria
  const reverseScale = config.reverseScale
  const passDescription = config.passDescription
  const failDescription = config.failDescription
  const isEmpty =
    !passDescription && !failDescription && !criteria && !reverseScale

  if (isEmpty) return null

  return {
    criteria,
    passDescription,
    failDescription,
    reverseScale,
  }
}

type ICriteria = ReturnType<typeof getCriteria>
function CriteriaDescription({
  criteria,
  passDescription,
  failDescription,
  reverseScale,
}: NonNullable<ICriteria>) {
  return (
    <CriteriaWrapper reverseScale={reverseScale} criteria={criteria}>
      {failDescription ? (
        <div>
          <Text.H5M color='background' display='block'>
            Fail criteria
          </Text.H5M>
          <Text.H6 color='primaryForeground'>{failDescription}</Text.H6>
        </div>
      ) : null}
      {passDescription ? (
        <div>
          <Text.H5M color='background' display='block'>
            Pass criteria
          </Text.H5M>
          <Text.H6 color='primaryForeground'>{passDescription}</Text.H6>
        </div>
      ) : null}
    </CriteriaWrapper>
  )
}

function getThumbsUpFromScore(score: number | undefined | null) {
  if (score === null || score === undefined) return null
  return score === 1
}

function AnnotationForm({
  evaluation,
  result,
}: AnnotationFormProps<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  const criteria = useMemo(() => getCriteria(evaluation), [evaluation])
  const { onSubmit, isExpanded, setIsExpanded } = use(AnnotationContext)
  const [score, setScore] = useState<number | undefined>(
    result?.score ?? undefined,
  )
  const { reason, onChangeReason } = useAnnotationFormState({ score })

  const [thumbsUp, setThumbsUp] = useState<boolean | null>(() =>
    getThumbsUpFromScore(result?.score),
  )

  // Calculate hasPassed optimistically based on current score
  const hasPassed = useMemo(() => {
    if (score === undefined) return result?.hasPassed
    const reverseScale = evaluation.configuration.reverseScale
    return reverseScale ? score === 0 : score === 1
  }, [score, evaluation.configuration.reverseScale, result?.hasPassed])
  const onThumbsUpClick = useCallback(
    (newThumbsUp: boolean) => {
      if (newThumbsUp === thumbsUp) return

      setThumbsUp(newThumbsUp)
      const newScore = newThumbsUp ? 1 : 0
      setScore(newScore)

      // Expand the form when user interacts
      if (!isExpanded) {
        setIsExpanded(true)
      }

      onSubmit({
        score: newScore,
        resultMetadata: result?.metadata ?? {},
      })
    },
    [onSubmit, result?.metadata, thumbsUp, isExpanded, setIsExpanded],
  )

  return (
    <>
      {isExpanded && (
        <div className='animate-in fade-in slide-in-from-top-2 duration-300'>
          <AForm.Body>
            <AForm.TextArea
              name='reason'
              value={reason}
              onChange={onChangeReason}
            />
          </AForm.Body>
        </div>
      )}
      <AForm.Footer>
        <input type='hidden' name='score' value={thumbsUp ? '1' : '0'} />
        <ThumbsUpDownInput
          onThumbsClick={onThumbsUpClick}
          thumbsUp={thumbsUp}
          hasPassed={hasPassed ?? undefined}
        />
        {isExpanded && (
          <div className='animate-in fade-in duration-300'>
            <AForm.AnnotationTooltipInfo
              tooltip={
                criteria ? <CriteriaDescription {...criteria} /> : undefined
              }
            />
          </div>
        )}
      </AForm.Footer>
    </>
  )
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.reverseScale ? undefined : 50,
      upper: evaluation.configuration.reverseScale ? 50 : undefined,
    },
    scale: (point: number) => Math.min(Math.max(point * 100, 0), 100),
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% passes`,
  }
}
