'use client'

import { ReactNode, useEffect, useState } from 'react'

import { FormField, type FormFieldProps } from '../FormField'
import {
  SelectContent,
  SelectContentInner,
  SelectGroup,
  SelectItem,
  SelectPrimitiveContent,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from './Primitives'

export type SelectOption<V extends unknown = unknown> = {
  label: string
  value: V
  icon?: ReactNode
}

export type SelectOptionGroup = {
  label: string
  options: SelectOption[]
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

export type SelectProps = Omit<FormFieldProps, 'children'> & {
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
}: SelectProps) {
  const [selectedValue, setSelected] = useState(value ?? defaultValue)
  useEffect(() => {
    setSelected(value ?? defaultValue)
  }, [value, defaultValue])
  const _onChange = (newValue: string) => {
    setSelected(newValue)
    if (onChange) onChange(newValue)
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

export function StandaloneSelectContent({
  name,
  options,
  required,
  disabled,
  value,
  defaultValue,
  onChange,
  open = true,
}: {
  open?: boolean
  name?: string
  required?: boolean
  disabled?: boolean
  options: SelectOption[]
  defaultValue?: string
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <SelectRoot
      open={open}
      name={name}
      required={required}
      disabled={disabled}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onChange}
    >
      <SelectPrimitiveContent position='item-aligned'
        className='max-h-96 text-popover-foreground bg-popover !block'
        style={{ display: 'block !important' }}
      >
        <SelectGroup>
          <Options options={options} />
        </SelectGroup>
      </SelectPrimitiveContent>
    </SelectRoot>
  )
}
