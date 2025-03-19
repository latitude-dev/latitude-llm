import {
  EvaluationType,
  RuleEvaluationExactMatchSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { IconName, Input, SwitchInput } from '@latitude-data/web-ui'
import { ConfigurationFormProps, ResultBadgeProps } from '../index'

const specification = RuleEvaluationExactMatchSpecification
export default {
  ...specification,
  icon: 'equal' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
}

function ConfigurationForm({
  configuration,
  setConfiguration,
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
        disabled={disabled}
        required
      />
      <Input
        value={configuration.datasetLabel ?? ''}
        name='datasetLabel'
        label='Dataset Label'
        description='The column of the dataset to match against'
        placeholder='label'
        onChange={(e) =>
          setConfiguration({ ...configuration, datasetLabel: e.target.value })
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
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>) {
  return <>{result.hasPassed ? 'Matched' : 'Unmatched'}</>
}
