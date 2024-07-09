'use client'

import { ReactNode, useState } from 'react'

import { FormField, type FormFieldProps } from '$ui/ds/atoms/FormField'

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
}: SelectProps) {
  const [selectedValue, setSelected] = useState(value ?? defaultValue)
  return (
    <FormField label={label} description={description} errors={errors}>
      <div className='w-full'>
        <SelectRoot
          name={name}
          value={value}
          defaultValue={defaultValue}
          onValueChange={setSelected}
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
