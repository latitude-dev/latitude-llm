'use client'
import { FormField } from '../FormField'
import { Label } from '../Label'
import { SelectOption } from '../Select'
import { SelectProps } from '../Select'
import { RadioGroup, RadioGroupItem } from './Primitives'

function Options({ options }: { options: SelectOption[] }) {
  return options.map((option) => (
    <Label key={option.label} className='flex items-center gap-x-2'>
      <RadioGroupItem value={String(option.value)} />
      <span>{option.label}</span>
    </Label>
  ))
}

export function RadioButtonsInput<V extends unknown = unknown>({
  name,
  label,
  badgeLabel,
  description,
  errors,
  options,
  defaultValue,
  value,
  info,
  onChange,
  width = 'full',
  disabled = false,
  required = false,
}: SelectProps<V>) {
  const _onChange = (newValue: string) => {
    if (onChange) onChange(newValue as V)
  }
  return (
    <FormField
      badgeLabel={badgeLabel}
      label={label}
      info={info}
      description={description}
      errors={errors}
      className={width === 'full' ? 'w-full' : 'w-auto'}
    >
      <div className={width === 'full' ? 'w-full' : 'w-auto'}>
        <RadioGroup
          required={required}
          disabled={disabled}
          name={name}
          value={value as string}
          defaultValue={defaultValue as string}
          onValueChange={_onChange}
        >
          <Options options={options} />
        </RadioGroup>
      </div>
    </FormField>
  )
}
