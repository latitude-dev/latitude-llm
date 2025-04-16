import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
} from '@latitude-data/constants'
import { SelectableSwitch } from '@latitude-data/web-ui/molecules/SelectableSwitch'
import { useEffect, useState } from 'react'
import { ConfigurationFormProps, EVALUATION_SPECIFICATIONS } from './index'

export default function ConfigurationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  mode,
  type,
  metric,
  configuration: defaultConfiguration,
  onChange,
  errors,
  disabled,
}: Omit<ConfigurationFormProps<T, M>, 'configuration' | 'setConfiguration'> & {
  type: T
  metric: M
  configuration?: EvaluationConfiguration<T, M>
  onChange?: (configuration: EvaluationConfiguration<T, M>) => void
}) {
  // TODO(evalsv2): Delete this intermediate state, does not makes sense to have it and is problematic
  const [configuration, setConfiguration] = useState(
    defaultConfiguration ?? ({} as EvaluationConfiguration<T, M>),
  )
  useEffect(() => onChange?.(configuration), [configuration])

  const typeSpecification = EVALUATION_SPECIFICATIONS[type]
  if (!typeSpecification) return null

  return (
    <>
      <typeSpecification.ConfigurationForm
        mode={mode}
        metric={metric}
        configuration={configuration}
        setConfiguration={setConfiguration}
        errors={errors}
        disabled={disabled}
      />
      {mode === 'update' && (
        <SelectableSwitch
          selected={!(configuration.reverseScale ?? false)}
          name='reverseScale'
          label='Optimize for'
          trueLabel='Higher score'
          falseLabel='Lower score'
          description='The refiner will use this to decide whether to choose higher or lower score evaluation results when optimizing your prompt'
          onChange={(value) =>
            setConfiguration({ ...configuration, reverseScale: !value })
          }
          errors={errors?.['reverseScale']}
          disabled={disabled}
          required
        />
      )}
    </>
  )
}
