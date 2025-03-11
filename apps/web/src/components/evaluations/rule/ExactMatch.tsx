import {
  RuleEvaluationExactMatchConfiguration,
  RuleEvaluationExactMatchSpecification,
} from '@latitude-data/constants'
import { IconName, Input } from '@latitude-data/web-ui'
import { useEffect, useState } from 'react'

const specification = RuleEvaluationExactMatchSpecification
export default {
  ...specification,
  icon: 'equal' as IconName,
  ConfigurationForm: ConfigurationForm,
}

function ConfigurationForm({
  configuration: defaultConfiguration,
  onChange,
}: {
  mode: 'create' | 'update'
  configuration?: RuleEvaluationExactMatchConfiguration
  onChange?: (configuration: RuleEvaluationExactMatchConfiguration) => void
}) {
  const [configuration, setConfiguration] =
    useState<RuleEvaluationExactMatchConfiguration>({
      datasetLabel: defaultConfiguration?.datasetLabel ?? '',
    } as RuleEvaluationExactMatchConfiguration)
  useEffect(() => onChange?.(configuration), [configuration])

  return (
    <>
      <Input
        value={configuration.datasetLabel}
        name='datasetLabel'
        label='Dataset Label'
        description='The column of the dataset to match against'
        placeholder='label'
        onChange={(e) =>
          setConfiguration({ ...configuration, datasetLabel: e.target.value })
        }
        className='w-full'
        required
      />
    </>
  )
}
