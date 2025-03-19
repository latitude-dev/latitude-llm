import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationRegularExpressionSpecification,
} from '@latitude-data/constants'
import { IconName, Input } from '@latitude-data/web-ui'
import { ConfigurationFormProps, ResultBadgeProps } from '../index'

const specification = RuleEvaluationRegularExpressionSpecification
export default {
  ...specification,
  icon: 'regex' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
}

function ConfigurationForm({
  configuration,
  setConfiguration,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.RegularExpression
>) {
  return (
    <>
      <Input
        value={configuration.pattern ?? ''}
        name='pattern'
        label='Regex Pattern'
        description='The regex pattern to match against'
        placeholder='.*pattern.*'
        onChange={(e) =>
          setConfiguration({ ...configuration, pattern: e.target.value })
        }
        className='w-full'
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.RegularExpression
>) {
  return <>{result.hasPassed ? 'Matched' : 'Unmatched'}</>
}
