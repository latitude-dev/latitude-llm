import {
  DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationSettings,
  EvaluationTriggerTarget,
  EvaluationType,
  LAST_INTERACTION_DEBOUNCE_MAX_SECONDS,
  LAST_INTERACTION_DEBOUNCE_MIN_SECONDS,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useMemo } from 'react'

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
  specification,
  evaluateLiveLogs,
  errors,
  disabled,
}: {
  settings: EvaluationSettings<T, M>
  setSettings: (settings: EvaluationSettings<T, M>) => void
  specification?: EvaluationMetricSpecification<T, M>
  evaluateLiveLogs: boolean
  errors?: Record<string, string[] | undefined>
  disabled?: boolean
}) {
  const configuration = settings.configuration
  const triggerTarget = configuration.trigger?.target ?? 'every'

  const supportsResponseDebounce = useMemo(() => {
    return (
      !!specification?.supportsLiveEvaluation &&
      !!evaluateLiveLogs &&
      triggerTarget === 'last'
    )
  }, [specification, evaluateLiveLogs, triggerTarget])

  return (
    <FormFieldGroup
      label='Evaluated responses'
      description='Which assistant responses from the conversation to evaluate'
      tooltip={
        supportsResponseDebounce
          ? `How many seconds to wait after a response has been added to the conversation before considering it the last one. Only used when evaluating live logs`
          : undefined
      }
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
      {supportsResponseDebounce && (
        <Input
          value={configuration.trigger?.lastInteractionDebounce}
          name='lastInteractionDebounce'
          type='number'
          min={LAST_INTERACTION_DEBOUNCE_MIN_SECONDS}
          max={LAST_INTERACTION_DEBOUNCE_MAX_SECONDS}
          placeholder={`after ${DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS} seconds`}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10)
            if (isNaN(value)) return
            setSettings({
              ...settings,
              configuration: {
                ...configuration,
                trigger: {
                  ...configuration.trigger,
                  lastInteractionDebounce: value,
                },
              },
            })
          }}
          className='w-full px-3 h-8'
          disabled={disabled}
          errors={errors?.['trigger.lastInteractionDebounce']}
        />
      )}
    </FormFieldGroup>
  )
}
