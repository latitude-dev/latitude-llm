'use client'

import { ReactNode, useEffect, useState } from 'react'
import { cn } from '../../../lib/utils'
import { zIndex } from '../../tokens/zIndex'
import { FormField, type FormFieldProps } from '../FormField'
import { IconName } from '../Icons'
import { Skeleton } from '../Skeleton'
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
  icon?: ReactNode | IconName
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
  trigger?: ReactNode
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  required?: boolean
  onChange?: (value: V) => void
  width?: 'auto' | 'full'
}
export function Select<V extends unknown = unknown>({
  name,
  label,
  badgeLabel,
  description,
  errors,
  autoFocus,
  trigger,
  placeholder,
  options,
  defaultValue,
  value,
  info,
  onChange,
  width = 'full',
  loading = false,
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
      info={info}
      description={description}
      errors={errors}
      className={width === 'full' ? 'w-full' : 'w-auto'}
    >
      <div className={width === 'full' ? 'w-full' : 'w-auto'}>
        {loading ? (
          <Skeleton className='w-full h-8 rounded-md' />
        ) : (
          <SelectRoot
            required={required}
            disabled={disabled || loading}
            name={name}
            value={value as string}
            defaultValue={defaultValue as string}
            onValueChange={_onChange}
          >
            {trigger ? (
              trigger
            ) : (
              <SelectTrigger
                autoFocus={autoFocus}
                className={cn({
                  'border-red-500 focus:ring-red-500': errors,
                })}
              >
                <SelectValue
                  selected={selectedValue}
                  options={options}
                  placeholder={placeholder ?? 'Select an option'}
                />
              </SelectTrigger>
            )}
            <SelectContent className={zIndex.dropdown}>
              <SelectGroup>
                <Options options={options as SelectOption<V>[]} />
              </SelectGroup>
            </SelectContent>
          </SelectRoot>
        )}
      </div>
    </FormField>
  )
}

export * from './Primitives'
