import {
  EvaluationType,
  RuleEvaluationExactMatchSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'

const specification = RuleEvaluationExactMatchSpecification
export default {
  ...specification,
  icon: 'equal' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
}

function ConfigurationForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.ExactMatch
>) {
  return (
    <>
      <SwitchInput
        checked={configuration.caseInsensitive ?? false}
        name='caseInsensitive'
        label='Case insensitive'
        description='Ignore case when matching'
        onCheckedChange={(value) =>
          setConfiguration({ ...configuration, caseInsensitive: value })
        }
        errors={errors?.['caseInsensitive']}
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>) {
  return <>{result.score === 1 ? 'Matched' : 'Unmatched'}</>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.ExactMatch
>) {
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
