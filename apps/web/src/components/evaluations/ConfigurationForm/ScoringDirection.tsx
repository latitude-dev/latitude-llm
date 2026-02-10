import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
} from '@latitude-data/core/constants'
import { SelectableSwitch } from '@latitude-data/web-ui/molecules/SelectableSwitch'

export function ScoringDirection<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: {
  configuration: EvaluationConfiguration<T, M>
  setConfiguration: (configuration: EvaluationConfiguration<T, M>) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  return (
    <SelectableSwitch
      selected={!(configuration.reverseScale ?? false)}
      name='reverseScale'
      label='Optimize for'
      trueLabel='Higher score'
      falseLabel='Lower score'
      description='Whether a higher or lower score is better for this evaluation. This will guide the refiner to select the best results when optimizing your prompt'
      onChange={(value) =>
        setConfiguration({ ...configuration, reverseScale: !value })
      }
      errors={errors?.['reverseScale']}
      disabled={disabled}
      required
    />
  )
}
