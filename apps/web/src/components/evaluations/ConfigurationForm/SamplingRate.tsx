import {
  DEFAULT_EVALUATION_SAMPLE_RATE,
  EvaluationMetric,
  EvaluationSettings,
  EvaluationType,
  MAX_EVALUATION_SAMPLE_RATE,
  MIN_EVALUATION_SAMPLE_RATE,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'

export function SamplingRate<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  settings,
  setSettings,
  disabled,
}: {
  settings: EvaluationSettings<T, M>
  setSettings: (settings: EvaluationSettings<T, M>) => void
  disabled?: boolean
}) {
  const configuration = settings.configuration

  return (
    <FormFieldGroup
      label='Sampling rate'
      description='Percentage of eligible responses to evaluate. Set to 100% to evaluate all responses'
      layout='horizontal'
    >
      <Slider
        value={[
          configuration.trigger?.sampleRate ?? DEFAULT_EVALUATION_SAMPLE_RATE,
        ]}
        onValueChange={(value) => {
          setSettings({
            ...settings,
            configuration: {
              ...configuration,
              trigger: {
                ...configuration.trigger,
                sampleRate: value[0],
              },
            },
          })
        }}
        min={MIN_EVALUATION_SAMPLE_RATE}
        max={MAX_EVALUATION_SAMPLE_RATE}
        step={1}
        disabled={disabled}
        legend={{
          min: `${MIN_EVALUATION_SAMPLE_RATE}%`,
          value: `${configuration.trigger?.sampleRate ?? DEFAULT_EVALUATION_SAMPLE_RATE}%`,
          max: `${MAX_EVALUATION_SAMPLE_RATE}%`,
        }}
      />
    </FormFieldGroup>
  )
}
