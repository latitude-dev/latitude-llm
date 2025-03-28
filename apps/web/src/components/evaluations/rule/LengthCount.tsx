import { formatCount } from '$/lib/formatCount'
import {
  EvaluationType,
  RuleEvaluationLengthCountSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { IconName, NumberInput, Select } from '@latitude-data/web-ui'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = RuleEvaluationLengthCountSpecification
export default {
  ...specification,
  icon: 'space' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

const ALGORITHM_OPTIONS =
  specification.configuration.shape.algorithm.options.map((option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }))

function ConfigurationForm({
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
      <NumberInput
        value={configuration.minLength ?? undefined}
        name='minLength'
        label='Minimum length'
        description='The minimum length of the response'
        placeholder='No minimum'
        min={0}
        onChange={(value) =>
          setConfiguration({ ...configuration, minLength: value })
        }
        errors={errors?.['minLength']}
        defaultAppearance
        className='w-full'
        disabled={disabled}
        required
      />
      <NumberInput
        value={configuration.maxLength ?? undefined}
        name='maxLength'
        label='Maximum length'
        description='The maximum length of the response'
        placeholder='No maximum'
        min={0}
        onChange={(value) =>
          setConfiguration({ ...configuration, maxLength: value })
        }
        errors={errors?.['maxLength']}
        defaultAppearance
        className='w-full'
        disabled={disabled}
        required
      />
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
    min: evaluation.configuration.minLength ?? 0,
    max: evaluation.configuration.maxLength ?? Infinity,
    thresholds: {
      lower: evaluation.configuration.minLength,
      upper: evaluation.configuration.maxLength,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short
        ? `${formatCount(point)}`
        : `${formatCount(point)} ${evaluation.configuration.algorithm}s`,
  }
}
