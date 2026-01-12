import {
  EvaluationType,
  RuleEvaluationLengthCountSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { formatCount } from '@latitude-data/constants/formatCount'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import { ThresholdInput } from '../ThresholdInput'

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
      <ThresholdInput
        threshold={{
          min: configuration.minLength ?? undefined,
          max: configuration.maxLength ?? undefined,
        }}
        setThreshold={(value) =>
          setConfiguration({
            ...configuration,
            minLength: value.min,
            maxLength: value.max,
          })
        }
        name='length'
        label='length'
        description='length of the response'
        min={0}
        showMin={true}
        showMax={true}
        errors={errors}
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
