import {
  EvaluationType,
  RuleEvaluationLexicalOverlapSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import { ThresholdInput } from '../ThresholdInput'

const specification = RuleEvaluationLexicalOverlapSpecification
export default {
  ...specification,
  icon: 'blend' as IconName,
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
  RuleEvaluationMetric.LexicalOverlap
>) {
  return (
    <>
      <Select
        value={configuration.algorithm ?? ''}
        name='algorithm'
        label='Algorithm'
        description='How to measure overlap'
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
          min: configuration.minOverlap ?? undefined,
          max: configuration.maxOverlap ?? undefined,
        }}
        setThreshold={(value) =>
          setConfiguration({
            ...configuration,
            minOverlap: value.min,
            maxOverlap: value.max,
          })
        }
        name='overlap'
        label='overlap'
        description='percentage of overlap of the response'
        min={0}
        max={100}
        showMin={!configuration.reverseScale}
        showMax={configuration.reverseScale}
        errors={errors}
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.LexicalOverlap>) {
  return <>{result.score!.toFixed(0)}% overlap</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.LexicalOverlap
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.minOverlap,
      upper: evaluation.configuration.maxOverlap,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% overlap`,
  }
}
