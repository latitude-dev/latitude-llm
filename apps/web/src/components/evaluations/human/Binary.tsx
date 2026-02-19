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
import { useHasPassed } from '../hooks/useHasPassed'

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
  const {
    onSubmit,
    isExpanded,
    setIsExpanded,
    localReason,
    localScore,
    setLocalScore,
    setLocalReason,
  } = use(AnnotationContext)

  const [thumbsUp, setThumbsUp] = useState<boolean | null>(() =>
    getThumbsUpFromScore(result?.score),
  )

  const hasPassed = useHasPassed({
    evaluation,
    result,
    score: localScore,
  })

  const onThumbsUpClick = useCallback(
    (newThumbsUp: boolean) => {
      if (newThumbsUp === thumbsUp) {
        setIsExpanded((prev) => !prev)
        return
      }

      setThumbsUp(newThumbsUp)
      const newScore = newThumbsUp ? 1 : 0
      setLocalScore(newScore)

      if (!isExpanded) {
        setIsExpanded(true)
      }
    },
    [thumbsUp, isExpanded, setIsExpanded, setLocalScore],
  )

  const handleSave = useCallback(() => {
    if (localScore === undefined) return

    onSubmit({
      score: localScore,
      resultMetadata: {
        ...result?.metadata,
        reason: localReason,
      },
    })
  }, [localScore, localReason, result?.metadata, onSubmit])

  return (
    <>
      {isExpanded && (
        <div className='animate-in fade-in slide-in-from-top-2 duration-300'>
          <AForm.Body>
            <AForm.TextArea
              name='reason'
              value={localReason}
              onChange={setLocalReason}
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
          <div className='animate-in fade-in duration-300 flex items-center gap-x-2'>
            <AForm.SaveButton
              onClick={handleSave}
              disabled={
                localScore === undefined || (localScore === 0 && !localReason)
              }
            />
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
