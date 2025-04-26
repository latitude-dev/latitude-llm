import { EvaluationMetric, EvaluationType } from '@latitude-data/constants'
import { SelectableSwitch } from '@latitude-data/web-ui/molecules/SelectableSwitch'
import { ConfigurationFormProps, EVALUATION_SPECIFICATIONS } from './index'

export default function ConfigurationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  mode,
  type,
  metric,
  configuration,
  setConfiguration,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<T, M> & { type: T; metric: M }) {
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
        {...rest}
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
