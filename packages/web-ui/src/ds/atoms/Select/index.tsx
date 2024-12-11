'use client'

import { ReactNode, useEffect, useState } from 'react'

import { FormField, type FormFieldProps } from '../FormField'
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from './Primitives'

export type SelectOption<V extends unknown = unknown> = {
  label: string
  value: V
  icon?: ReactNode
}

export type SelectOptionGroup<V extends unknown = unknown> = {
  label: string
  options: SelectOption<V>[]
}
export function Options({ options }: { options: SelectOption[] }) {
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

export type SelectProps<V extends unknown = unknown> = Omit<
  FormFieldProps,
  'children'
> & {
  name: string
  options: SelectOption<V>[]
  defaultValue?: V
  value?: V
  placeholder?: string
  disabled?: boolean
  required?: boolean
  onChange?: (value: V) => void
}
export function Select<V extends unknown = unknown>({
  name,
  label,
  badgeLabel,
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
}: SelectProps<V>) {
  const [selectedValue, setSelected] = useState<V | undefined>(
    value ?? defaultValue,
  )
  useEffect(() => {
    setSelected(value ?? defaultValue)
  }, [value, defaultValue])
  const _onChange = (newValue: string) => {
    setSelected(newValue as V)
    if (onChange) onChange(newValue as V)
  }
  return (
    <FormField
      badgeLabel={badgeLabel}
      label={label}
      description={description}
      errors={errors}
    >
      <div className='w-full'>
        <SelectRoot
          required={required}
          disabled={disabled}
          name={name}
          value={value as string}
          defaultValue={defaultValue as string}
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
            <SelectGroup>
              <Options options={options as SelectOption<V>[]} />
            </SelectGroup>
          </SelectContent>
        </SelectRoot>
      </div>
    </FormField>
  )
}
