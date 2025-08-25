import {
  type EvaluationType,
  type RuleEvaluationMetric,
  RuleEvaluationRegularExpressionSpecification,
} from '@latitude-data/constants'
import type { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import type { ChartConfigurationArgs, ConfigurationFormProps, ResultBadgeProps } from '../index'

const specification = RuleEvaluationRegularExpressionSpecification
export default {
  ...specification,
  icon: 'regex' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Rule, RuleEvaluationMetric.RegularExpression>) {
  return (
    <Input
      value={configuration.pattern ?? ''}
      name='pattern'
      label='Regex pattern'
      description='The regex pattern to match against'
      placeholder='.*pattern.*'
      onChange={(e) => setConfiguration({ ...configuration, pattern: e.target.value })}
      errors={errors?.pattern}
      className='w-full'
      disabled={disabled}
      required
    />
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.RegularExpression>) {
  return <>{result.score === 1 ? 'Matched' : 'Unmatched'}</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Rule, RuleEvaluationMetric.RegularExpression>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.reverseScale ? undefined : 50,
      upper: evaluation.configuration.reverseScale ? 50 : undefined,
    },
    scale: (point: number) => Math.min(Math.max(point * 100, 0), 100),
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% matches`,
  }
}
