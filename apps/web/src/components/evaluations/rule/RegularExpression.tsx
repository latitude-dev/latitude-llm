import {
  RuleEvaluationRegularExpressionConfiguration,
  RuleEvaluationRegularExpressionSpecification,
} from '@latitude-data/constants'
import { IconName, Input } from '@latitude-data/web-ui'
import { useEffect, useState } from 'react'

const specification = RuleEvaluationRegularExpressionSpecification
export default {
  ...specification,
  icon: 'regex' as IconName,
  ConfigurationForm: ConfigurationForm,
}

function ConfigurationForm({
  configuration: defaultConfiguration,
  onChange,
}: {
  mode: 'create' | 'update'
  configuration?: RuleEvaluationRegularExpressionConfiguration
  onChange?: (
    configuration: RuleEvaluationRegularExpressionConfiguration,
  ) => void
}) {
  const [configuration, setConfiguration] =
    useState<RuleEvaluationRegularExpressionConfiguration>({
      pattern: defaultConfiguration?.pattern ?? '',
    } as RuleEvaluationRegularExpressionConfiguration)
  useEffect(() => onChange?.(configuration), [configuration])

  return (
    <>
      <Input
        value={configuration.pattern}
        name='pattern'
        label='Regex Pattern'
        description='The regex pattern to match against'
        placeholder='.*pattern.*'
        onChange={(e) =>
          setConfiguration({ ...configuration, pattern: e.target.value })
        }
        className='w-full'
        required
      />
    </>
  )
}
