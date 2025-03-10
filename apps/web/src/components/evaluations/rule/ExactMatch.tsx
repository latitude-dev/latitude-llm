import {
  RuleEvaluationExactMatchConfiguration,
  RuleEvaluationExactMatchSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'

const specification = RuleEvaluationExactMatchSpecification
export default {
  ...specification,
  icon: 'equal' as IconName,
  ConfigurationForm: ConfigurationForm,
}

function ConfigurationForm({
  configuration,
  onChange,
}: {
  configuration: RuleEvaluationExactMatchConfiguration
  onChange: (configuration: RuleEvaluationExactMatchConfiguration) => void
}) {
  configuration // TODO: Implement
  onChange // TODO: Implement
  return <div>Exact Match</div>
}
