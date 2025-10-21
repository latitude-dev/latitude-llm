import { useMemo } from 'react'
import { formatCount } from '$/lib/formatCount'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  HumanEvaluationRatingSpecification,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { StepperNumberInput } from '@latitude-data/web-ui/atoms/StepperNumberInput'
import {
  AnnotationFormProps,
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import { AnnotationFormWrapper as AForm } from '../Annotation/FormWrapper'
import { useAnnotationFormState } from './useAnnotationForm'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CriteriaDescription as CriteriaWrapper } from '../Annotation/CriteriaDescription'

function getCriteria(
  evaluation: EvaluationV2<EvaluationType.Human, HumanEvaluationMetric.Rating>,
) {
  const config = evaluation.configuration
  const criteria = config.criteria
  const minRatingDescription = config.minRatingDescription
  const maxRatingDescription = config.maxRatingDescription
  const reverseScale = config.reverseScale
  const isEmpty =
    !minRatingDescription && !maxRatingDescription && !criteria && !reverseScale

  if (isEmpty) return null

  return {
    criteria,
    minRatingDescription,
    maxRatingDescription,
    reverseScale,
  }
}

type ICriteria = ReturnType<typeof getCriteria>

function CriteriaDescription({
  minRatingDescription,
  maxRatingDescription,
  reverseScale,
  criteria,
}: NonNullable<ICriteria>) {
  return (
    <CriteriaWrapper reverseScale={reverseScale} criteria={criteria}>
      {minRatingDescription ? (
        <div>
          <Text.H5M color='background' display='block'>
            Low score criteria
          </Text.H5M>
          <Text.H6 color='primaryForeground'>{minRatingDescription}</Text.H6>
        </div>
      ) : null}
      {maxRatingDescription ? (
        <div>
          <Text.H5M color='background' display='block'>
            High score criteria
          </Text.H5M>
          <Text.H6 color='primaryForeground'>{maxRatingDescription}</Text.H6>
        </div>
      ) : null}
    </CriteriaWrapper>
  )
}

const specification = HumanEvaluationRatingSpecification
export default {
  ...specification,
  icon: 'star' as IconName,
  ConfigurationSimpleForm,
  ConfigurationAdvancedForm,
  ResultBadge,
  AnnotationForm,
  chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        label='Minimum rating'
        description='Additional guidelines describing when the response should be rated low'
      >
        <NumberInput
          value={configuration.minRating ?? undefined}
          name='minRating'
          placeholder='0'
          onChange={(value) => {
            if (value === undefined) return
            setConfiguration({ ...configuration, minRating: value })
          }}
          errors={errors?.['minRating']}
          className='w-full'
          fieldClassName='w-1/6'
          disabled={disabled}
          required
        />
        <Input
          value={configuration.minRatingDescription ?? ''}
          name='minRatingDescription'
          placeholder='The response discourages interaction'
          onChange={(e) =>
            setConfiguration({
              ...configuration,
              minRatingDescription: e.target.value,
            })
          }
          errors={errors?.['minRatingDescription']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
      <FormFieldGroup
        layout='horizontal'
        label='Maximum rating'
        description='Additional guidelines describing when the response should be rated high'
      >
        <NumberInput
          value={configuration.maxRating ?? undefined}
          name='maxRating'
          placeholder='5'
          onChange={(value) => {
            if (value === undefined) return
            setConfiguration({ ...configuration, maxRating: value })
          }}
          errors={errors?.['maxRating']}
          className='w-full'
          fieldClassName='w-1/6'
          disabled={disabled}
          required
        />
        <Input
          value={configuration.maxRatingDescription ?? ''}
          name='maxRatingDescription'
          placeholder='The response promotes continued interaction'
          onChange={(e) =>
            setConfiguration({
              ...configuration,
              maxRatingDescription: e.target.value,
            })
          }
          errors={errors?.['maxRatingDescription']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ConfigurationAdvancedForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum rating threshold of the response'
      >
        <NumberInput
          value={configuration.minThreshold ?? undefined}
          name='minThreshold'
          label='Minimum threshold'
          placeholder='No minimum'
          min={configuration.minRating}
          max={configuration.maxRating}
          onChange={(value) =>
            setConfiguration({ ...configuration, minThreshold: value })
          }
          errors={errors?.['minThreshold']}
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          value={configuration.maxThreshold ?? undefined}
          name='maxThreshold'
          label='Maximum threshold'
          placeholder='No maximum'
          min={configuration.minRating}
          max={configuration.maxRating}
          onChange={(value) =>
            setConfiguration({ ...configuration, maxThreshold: value })
          }
          errors={errors?.['maxThreshold']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return <>{formatCount(result.score!)}</>
}

function AnnotationForm({
  evaluation,
  result,
}: AnnotationFormProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  const criteria = useMemo(() => getCriteria(evaluation), [evaluation])
  const { onScoreChange, onSubmit } = useAnnotationFormState({
    initialScore: result?.score ?? undefined,
  })
  return (
    <AForm onSubmit={onSubmit}>
      <AForm.Body>
        <AForm.TextArea
          name='reason'
          defaultValue={result?.metadata?.reason ?? ''}
        />
      </AForm.Body>
      <AForm.Footer>
        <div className='flex items-center gap-x-2'>
          <StepperNumberInput
            name='score'
            value={result?.score ?? undefined}
            min={evaluation.configuration.minRating}
            max={evaluation.configuration.maxRating}
            onChange={onScoreChange}
          />
          <Text.H6M color='foregroundMuted'>
            of {evaluation.configuration.maxRating}
          </Text.H6M>
        </div>

        <AForm.SubmitButtonWithTooltip
          tooltip={criteria ? <CriteriaDescription {...criteria} /> : undefined}
        />
      </AForm.Footer>
    </AForm>
  )
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return {
    min: evaluation.configuration.minRating,
    max: evaluation.configuration.maxRating,
    thresholds: {
      lower: evaluation.configuration.minThreshold,
      upper: evaluation.configuration.maxThreshold,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${formatCount(point)}` : `${point.toFixed(2)}`,
  }
}
