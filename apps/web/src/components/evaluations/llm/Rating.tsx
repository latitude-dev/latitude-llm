import { formatCount } from '$/lib/formatCount'
import {
  type EvaluationType,
  type LlmEvaluationMetric,
  LlmEvaluationRatingSpecification,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import type { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import type { ChartConfigurationArgs, ConfigurationFormProps, ResultBadgeProps } from '../index'

const specification = LlmEvaluationRatingSpecification
export default {
  ...specification,
  icon: 'star' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ConfigurationAdvancedForm: ConfigurationAdvancedForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Llm, LlmEvaluationMetric.Rating>) {
  return (
    <>
      <TextArea
        value={configuration.criteria ?? ''}
        name='criteria'
        label='Criteria'
        description='Instructions to guide the LLM on the criteria to judge against'
        placeholder='Judge the engagement of the response'
        minRows={2}
        maxRows={4}
        onChange={(e) => setConfiguration({ ...configuration, criteria: e.target.value })}
        errors={errors?.criteria}
        className='w-full'
        disabled={disabled}
        required
      />
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
          errors={errors?.minRating}
          defaultAppearance
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
          errors={errors?.minRatingDescription}
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
          errors={errors?.maxRating}
          defaultAppearance
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
          errors={errors?.maxRatingDescription}
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
}: ConfigurationFormProps<EvaluationType.Llm, LlmEvaluationMetric.Rating>) {
  return (
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
        onChange={(value) => setConfiguration({ ...configuration, minThreshold: value })}
        errors={errors?.minThreshold}
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
        onChange={(value) => setConfiguration({ ...configuration, maxThreshold: value })}
        errors={errors?.maxThreshold}
        defaultAppearance
        className='w-full'
        disabled={disabled}
        required
      />
    </FormFieldGroup>
  )
}

function ResultBadge({ result }: ResultBadgeProps<EvaluationType.Llm, LlmEvaluationMetric.Rating>) {
  return <>{formatCount(result.score!)}</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Llm, LlmEvaluationMetric.Rating>) {
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
