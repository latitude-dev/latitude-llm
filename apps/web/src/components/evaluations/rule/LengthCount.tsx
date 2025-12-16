import {
  EvaluationType,
  RuleEvaluationLengthCountSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { formatCount } from '@latitude-data/constants/formatCount'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = RuleEvaluationLengthCountSpecification
export default {
  ...specification,
  icon: 'wholeWord' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

const ALGORITHM_OPTIONS =
  specification.configuration.shape.algorithm.options.map((option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }))

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.LengthCount
>) {
  return (
    <>
      <Select
        value={configuration.algorithm ?? ''}
        name='algorithm'
        label='Algorithm'
        description='What to count in the response'
        placeholder='Select an algorithm'
        options={ALGORITHM_OPTIONS}
        onChange={(value) =>
          setConfiguration({ ...configuration, algorithm: value })
        }
        errors={errors?.['algorithm']}
        disabled={disabled}
        required
      />
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum length of the response'
      >
        <NumberInput
          value={configuration.minLength ?? undefined}
          name='minLength'
          label='Minimum length'
          placeholder='No minimum'
          min={0}
          onChange={(value) =>
            setConfiguration({ ...configuration, minLength: value })
          }
          errors={errors?.['minLength']}
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          value={configuration.maxLength ?? undefined}
          name='maxLength'
          label='Maximum length'
          placeholder='No maximum'
          min={0}
          onChange={(value) =>
            setConfiguration({ ...configuration, maxLength: value })
          }
          errors={errors?.['maxLength']}
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
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.LengthCount>) {
  return (
    <>
      {formatCount(result.score!)} {result.metadata!.configuration.algorithm}s
    </>
  )
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.LengthCount
>) {
  return {
    min: 0,
    max: evaluation.configuration.maxLength ?? Infinity,
    thresholds: {
      lower: evaluation.configuration.minLength,
      upper: evaluation.configuration.maxLength,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short
        ? `${formatCount(point)}`
        : `${point.toFixed(2)} ${evaluation.configuration.algorithm}s`,
  }
}
