import { MultipleInput } from '@latitude-data/web-ui/molecules/MultipleInput'
import { MultiSelect } from '@latitude-data/web-ui/molecules/MultiSelect'
import {
  ConfigurablePropIntegerArray,
  ConfigurablePropStringArray,
} from '@pipedream/sdk/browser'
import { useState } from 'react'

export default function ArrayPipedreamProp<
  T extends 'text' | 'number' = 'text',
  V extends string | number = T extends 'text' ? string : number,
>({
  prop,
  type,
  value,
  setValue,
  disabled,
}: {
  prop: ConfigurablePropStringArray | ConfigurablePropIntegerArray
  type: T
  value: V[]
  setValue: (value: V[]) => void
  disabled?: boolean
}) {
  const [initialValue] = useState<string[]>(() => {
    if (type === 'text') return value as string[]
    return value.map((v) => String(v))
  })

  if (prop.options) {
    return (
      <MultiSelect
        label={prop.label ?? prop.name}
        description={prop.description}
        onChange={(newValues: string[]) => {
          if (type === 'text') return newValues
          return newValues.map((v) => Number(v)) as V[]
        }}
        options={prop.options.map((option) => {
          if (typeof option === 'object') {
            return {
              label: option.label,
              value: String(option.value),
            }
          }
          return { label: String(option), value: String(option) }
        })}
        defaultValue={initialValue}
        required={!prop.optional}
        disabled={disabled || prop.disabled}
      />
    )
  }

  return (
    <MultipleInput
      values={value}
      setValues={setValue}
      type={type}
      label={prop.label ?? prop.name}
      description={prop.description}
      disabled={prop.disabled}
      required={!prop.optional}
    />
  )
}
