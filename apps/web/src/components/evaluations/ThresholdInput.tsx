import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { camelCase } from 'lodash-es'
import { useEffect, useMemo } from 'react'

export function ThresholdInput({
  threshold,
  setThreshold,
  name,
  label,
  description: descriptionProp,
  min,
  max,
  showMin,
  showMax,
  errors,
  disabled,
  required,
}: {
  threshold: { min?: number; max?: number }
  setThreshold: (threshold: { min?: number; max?: number }) => void
  name: string
  label: string
  description: string
  min?: number
  max?: number
  showMin?: boolean
  showMax?: boolean
  errors?: Record<string, string[]>
  disabled?: boolean
  required?: boolean
}) {
  const description = useMemo(() => {
    if (showMin && showMax) {
      return `The minimum and maximum ${descriptionProp}`
    }

    if (showMin) {
      return `The minimum ${descriptionProp}`
    }

    if (showMax) {
      return `The maximum ${descriptionProp}`
    }

    return 'unreachable'
  }, [showMin, showMax, descriptionProp])

  useEffect(() => {
    if (!showMin) setThreshold({ ...threshold, min: undefined })
    if (!showMax) setThreshold({ ...threshold, max: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMin, showMax])

  if (!showMin && !showMax) {
    return null
  }

  return (
    <FormFieldGroup
      layout='horizontal'
      description={description}
      errors={errors?.['threshold'] ?? errors?.[camelCase(`${name}Threshold`)]}
    >
      {!!showMin && (
        <NumberInput
          value={threshold.min ?? undefined}
          name={camelCase(`min${name}`)}
          label={`Minimum ${label}`}
          placeholder='No minimum'
          min={min}
          max={max}
          onChange={(value) => setThreshold({ ...threshold, min: value })}
          errors={errors?.[camelCase(`min${name}`)]}
          className='w-full'
          disabled={disabled}
          required={required}
        />
      )}
      {!!showMax && (
        <NumberInput
          value={threshold.max ?? undefined}
          name={camelCase(`max${name}`)}
          label={`Maximum ${label}`}
          placeholder='No maximum'
          min={min}
          max={max}
          onChange={(value) => setThreshold({ ...threshold, max: value })}
          errors={errors?.[camelCase(`max${name}`)]}
          className='w-full'
          disabled={disabled}
          required={required}
        />
      )}
    </FormFieldGroup>
  )
}
