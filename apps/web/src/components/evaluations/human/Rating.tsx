import { formatCount } from '$/lib/formatCount'
import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationRatingSpecification,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { TabSelect } from '@latitude-data/web-ui/molecules/TabSelect'
import { useMemo } from 'react'
import {
  AnnotationFormProps,
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = HumanEvaluationRatingSpecification
export default {
  ...specification,
  icon: 'star' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  AnnotationForm: AnnotationForm,
  chartConfiguration: chartConfiguration,
}

function ConfigurationForm({
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
        description='When should the response be rated low?'
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
          defaultAppearance
          className='w-full'
          fieldClassName='w-1/6'
          disabled={disabled}
          required
        />
        <Input
          value={configuration.minRatingDescription ?? ''}
          name='minRatingDescription'
          placeholder='No minimum rating description'
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
        description='When should the response be rated high?'
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
          defaultAppearance
          className='w-full'
          fieldClassName='w-1/6'
          disabled={disabled}
          required
        />
        <Input
          value={configuration.maxRatingDescription ?? ''}
          name='maxRatingDescription'
          placeholder='No maximum rating description'
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
          defaultAppearance
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
          defaultAppearance
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
  resultScore,
  setResultScore,
  disabled,
}: AnnotationFormProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  const range = Math.abs(
    evaluation.configuration.maxRating - evaluation.configuration.minRating,
  )

  const options = useMemo(() => {
    if (range > 10) return []

    const options = []
    for (
      let i = evaluation.configuration.minRating;
      i <= evaluation.configuration.maxRating;
      i++
    ) {
      options.push({
        label: i.toString(),
        value: i,
      })
    }

    return options
  }, [range, evaluation])

  const description = useMemo(() => {
    const description = []

    if (evaluation.configuration.minRatingDescription) {
      description.push(
        `The response should be rated low when: ${evaluation.configuration.minRatingDescription}`,
      )
    }

    if (evaluation.configuration.maxRatingDescription) {
      description.push(
        `The response should be rated high when: ${evaluation.configuration.maxRatingDescription}`,
      )
    }

    return description.join('. ')
  }, [evaluation.configuration])

  return (
    <>
      {range > 10 ? (
        <NumberInput
          value={resultScore ?? undefined}
          name='resultScore'
          description={description || 'The rating of the response'}
          placeholder='No rating'
          min={evaluation.configuration.minRating}
          max={evaluation.configuration.maxRating}
          onChange={(value) => {
            if (value === undefined) return
            setResultScore(value)
          }}
          defaultAppearance
          className='w-full'
          disabled={disabled}
          required
        />
      ) : (
        <TabSelect
          value={resultScore ?? undefined}
          name='resultScore'
          description={description || 'The rating of the response'}
          options={options}
          onChange={(value) => setResultScore(value)}
          disabled={disabled}
          required
        />
      )}
    </>
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
