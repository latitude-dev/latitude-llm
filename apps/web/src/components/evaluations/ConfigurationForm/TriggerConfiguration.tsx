import {
  DEFAULT_EVALUATION_SAMPLE_RATE,
  DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
  EvaluationMetric,
  EvaluationSettings,
  EvaluationTriggerTarget,
  EvaluationType,
  LAST_INTERACTION_DEBOUNCE_MAX_SECONDS,
  LAST_INTERACTION_DEBOUNCE_MIN_SECONDS,
  MAX_EVALUATION_SAMPLE_RATE,
  MIN_EVALUATION_SAMPLE_RATE,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { Text } from '@latitude-data/web-ui/atoms/Text'

const TRIGGER_TARGET_OPTIONS: Record<
  EvaluationTriggerTarget,
  {
    label: string
    icon?: IconName
  }
> = {
  first: {
    label: 'First response only',
    icon: 'messageSquareText',
  },
  every: {
    label: 'Every response',
    icon: 'messagesSquare',
  },
  last: {
    label: 'Last response only',
    icon: 'messageSquareDashed',
  },
}

export function TriggerConfiguration<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  settings,
  setSettings,
  evaluateLiveLogs,
  errors,
  disabled,
}: {
  settings: EvaluationSettings<T, M>
  setSettings: (settings: EvaluationSettings<T, M>) => void
  evaluateLiveLogs: boolean
  errors?: Record<string, string[] | undefined>
  disabled?: boolean
}) {
  const configuration = settings.configuration
  const triggerTarget = configuration.trigger?.target ?? 'last'

  const liveEvaluationOnLastResponse =
    evaluateLiveLogs && triggerTarget === 'last'

  return (
    <FormWrapper>
      <FormFieldGroup
        label='Evaluated responses'
        description='Which assistant responses from the conversation to evaluate'
        layout='horizontal'
      >
        <Select
          value={triggerTarget}
          name='triggerTarget'
          placeholder='Select responses'
          options={Object.entries(TRIGGER_TARGET_OPTIONS).map(
            ([value, { label, icon }]) => ({
              label,
              value,
              icon,
            }),
          )}
          onChange={(value) =>
            setSettings({
              ...settings,
              configuration: {
                ...configuration,
                trigger: {
                  ...configuration.trigger,
                  target: value as EvaluationTriggerTarget,
                },
              },
            })
          }
          errors={errors?.['trigger.target']}
          disabled={disabled}
        />
      </FormFieldGroup>
      {liveEvaluationOnLastResponse && (
        <FormFieldGroup
          label='Response timeout'
          description='How many seconds to wait after a response has been added to the conversation before considering it the "last response". Used only when evaluating the last response in Live Evaluation mode'
          layout='horizontal'
        >
          <Input
            value={
              configuration.trigger?.lastInteractionDebounce?.toString() ?? ''
            }
            name='lastInteractionDebounce'
            type='number'
            min={LAST_INTERACTION_DEBOUNCE_MIN_SECONDS}
            max={LAST_INTERACTION_DEBOUNCE_MAX_SECONDS}
            placeholder={DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS.toString()}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10)
              setSettings({
                ...settings,
                configuration: {
                  ...configuration,
                  trigger: {
                    ...configuration.trigger,
                    lastInteractionDebounce: isNaN(value)
                      ? DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS
                      : value,
                  },
                },
              })
            }}
            className='w-full'
            disabled={disabled}
            errors={errors?.['trigger.lastInteractionDebounce']}
          />
        </FormFieldGroup>
      )}
      <FormFieldGroup
        label='Sampling rate'
        description='Percentage of eligible responses to evaluate. Set to 100% to evaluate all responses'
        layout='horizontal'
      >
        <div className='flex flex-col gap-2 w-full'>
          <div className='flex items-center justify-between'>
            <Text.H6 color='foregroundMuted'>0%</Text.H6>
            <Text.H5M color='primary'>
              {configuration.trigger?.sampleRate ??
                DEFAULT_EVALUATION_SAMPLE_RATE}
              %
            </Text.H5M>
            <Text.H6 color='foregroundMuted'>100%</Text.H6>
          </div>
          <Slider
            value={[
              configuration.trigger?.sampleRate ??
                DEFAULT_EVALUATION_SAMPLE_RATE,
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
          />
        </div>
      </FormFieldGroup>
    </FormWrapper>
  )
}
