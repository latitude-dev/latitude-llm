import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
} from '@latitude-data/constants'
import { SwitchInput } from '@latitude-data/web-ui'
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
  disabled,
}: Omit<ConfigurationFormProps<T, M>, 'configuration' | 'setConfiguration'> & {
  type: T
  metric: M
  configuration?: EvaluationConfiguration<T, M>
  onChange?: (configuration: EvaluationConfiguration<T, M>) => void
}) {
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
        disabled={disabled}
      />
      <SwitchInput
        checked={configuration.reverseScale ?? false}
        name='reverseScale'
        label={
          configuration.reverseScale ? 'Lower is better' : 'Higher is better'
        }
        description='Orientation of the metric scale when normalizing the score for internal operations and to display evaluation results'
        onCheckedChange={(value) =>
          setConfiguration({ ...configuration, reverseScale: value })
        }
        disabled={disabled}
        required
      />
    </>
  )
}
