import {
  RuleEvaluationRegularExpressionConfiguration,
  RuleEvaluationRegularExpressionSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'

const specification = RuleEvaluationRegularExpressionSpecification
export default {
  ...specification,
  icon: 'regex' as IconName,
  ConfigurationForm: ConfigurationForm,
}

function ConfigurationForm({
  configuration,
  onChange,
}: {
  configuration: RuleEvaluationRegularExpressionConfiguration
  onChange: (
    configuration: RuleEvaluationRegularExpressionConfiguration,
  ) => void
}) {
  configuration // TODO: Implement
  onChange // TODO: Implement
  return <div>Regular Expression</div>
}
