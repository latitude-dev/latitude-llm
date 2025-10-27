import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationBinarySpecification,
  HumanEvaluationMetric,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useMemo, useState } from 'react'
import { CriteriaDescription as CriteriaWrapper } from '../Annotation/CriteriaDescription'
import { AnnotationFormWrapper as AForm } from '../Annotation/FormWrapper'
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

function AnnotationForm({
  evaluation,
  result,
}: AnnotationFormProps<EvaluationType.Human, HumanEvaluationMetric.Binary>) {
  const criteria = useMemo(() => getCriteria(evaluation), [evaluation])
  const { onScoreChange, onSubmit } = useAnnotationFormState({
    initialScore: result?.score ?? undefined,
  })
  const [thumbsUp, setThumbsUp] = useState<boolean | null>(
    typeof result?.score === 'number'
      ? result?.score === 1
        ? true
        : false
      : null,
  )
  const onThumbsUpClick = useCallback(
    (thumbs: boolean) => {
      setThumbsUp(thumbs)
      onScoreChange(thumbs ? 1 : 0)
    },
    [onScoreChange],
  )

  return (
    <AForm onSubmit={onSubmit}>
      <AForm.Body>
        <AForm.TextArea
          name='reason'
          defaultValue={result?.metadata?.reason ?? ''}
        />
      </AForm.Body>
      <AForm.Footer>
        <input type='hidden' name='score' value={thumbsUp ? '1' : '0'} />
        <ThumbsUpDownInput
          onThumbsClick={onThumbsUpClick}
          thumbsUp={thumbsUp}
        />
        <AForm.SubmitButtonWithTooltip
          tooltip={criteria ? <CriteriaDescription {...criteria} /> : undefined}
        />
      </AForm.Footer>
    </AForm>
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
