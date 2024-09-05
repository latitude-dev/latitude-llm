'use client'

import { ReactNode, useState } from 'react'

import { FormField, type FormFieldProps } from '../FormField'
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from './Primitives'

export type SelectOption = {
  label: string
  value: unknown
  icon?: ReactNode
}

export type SelectOptionGroup = {
  label: string
  options: SelectOption[]
}
function Options({ options }: { options: SelectOption[] }) {
  return options.map((option) => (
    <SelectItem
      key={option.label}
      value={String(option.value)}
      icon={option.icon}
    >
      {option.label}
    </SelectItem>
  ))
}

type SelectProps = Omit<FormFieldProps, 'children'> & {
  name: string
  options: SelectOption[] | SelectOptionGroup[]
  defaultValue?: string
  value?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  onChange?: (value: string) => void
}
export function Select({
  name,
  label,
  description,
  errors,
  autoFocus,
  placeholder,
  options,
  defaultValue,
  value,
  onChange,
  disabled = false,
  required = false,
}: SelectProps) {
  const [selectedValue, setSelected] = useState(value ?? defaultValue)
  const _onChange = (newValue: string) => {
    setSelected(newValue)
    if (onChange) onChange(newValue)
  }
  return (
    <FormField label={label} description={description} errors={errors}>
      <div className='w-full'>
        <SelectRoot
          required={required}
          disabled={disabled}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onValueChange={_onChange}
        >
          <SelectTrigger autoFocus={autoFocus}>
            <SelectValue
              selected={selectedValue}
              options={options}
              placeholder={placeholder ?? 'Select an option'}
            />
          </SelectTrigger>
          <SelectContent>
            {'options' in options ? (
              <div>Grouping</div>
            ) : (
              <SelectGroup>
                <Options options={options as SelectOption[]} />
              </SelectGroup>
            )}
          </SelectContent>
        </SelectRoot>
      </div>
    </FormField>
  )
}
