import { EvaluationMetric, EvaluationType } from '@latitude-data/constants'
import { SelectableSwitch } from '@latitude-data/web-ui/molecules/SelectableSwitch'
import { ConfigurationFormProps, EVALUATION_SPECIFICATIONS } from './index'

export function ConfigurationSimpleForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  type,
  metric,
  ...rest
}: ConfigurationFormProps<T, M> & { type: T; metric: M }) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[type]
  if (!typeSpecification) return null

  return (
    <>
      <typeSpecification.ConfigurationSimpleForm metric={metric} {...rest} />
    </>
  )
}

export function ConfigurationAdvancedForm<
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
      {!!typeSpecification.ConfigurationAdvancedForm && (
        <typeSpecification.ConfigurationAdvancedForm
          mode={mode}
          metric={metric}
          configuration={configuration}
          setConfiguration={setConfiguration}
          errors={errors}
          disabled={disabled}
          {...rest}
        />
      )}
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
    </>
  )
}
