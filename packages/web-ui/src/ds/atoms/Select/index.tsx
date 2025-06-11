'use client'

import { ReactNode, useEffect, useState } from 'react'
import { cn } from '../../../lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../atoms/Command'
import { zIndex } from '../../tokens/zIndex'
import { FormField, type FormFieldProps } from '../FormField'
import { Icon, IconName } from '../Icons'
import { Skeleton } from '../Skeleton'
import { Text } from '../Text'
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
  removable?: boolean
  searchable?: boolean
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
  removable = false,
  searchable = false,
}: SelectProps<V>) {
  const [selectedValue, setSelected] = useState<V | undefined>(
    value ?? defaultValue,
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setSelected(value ?? defaultValue)
  }, [value, defaultValue])

  const _onChange = (newValue: string | undefined) => {
    setSelected(newValue as V)
    if (onChange) onChange(newValue as V)
    setIsOpen(false) // Close the popover on selection
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
            value={selectedValue as string}
            defaultValue={defaultValue as string}
            onValueChange={searchable ? undefined : _onChange}
            open={isOpen}
            onOpenChange={setIsOpen}
          >
            {trigger ? (
              trigger
            ) : (
              <SelectTrigger
                autoFocus={autoFocus}
                className={cn({
                  'border-red-500 focus:ring-red-500': errors,
                })}
                removable={removable && !!selectedValue}
                onRemove={() => _onChange(undefined)}
              >
                <SelectValue
                  selected={selectedValue}
                  options={options}
                  placeholder={placeholder ?? 'Select an option'}
                />
              </SelectTrigger>
            )}
            <SelectContent className={cn(zIndex.dropdown, 'p-0')}>
              {searchable ? (
                <>
                  <Command>
                    <CommandInput
                      placeholder='Search...'
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      className='text-xs' // Consistent with MultiSelect
                    />
                    <CommandList>
                      <CommandEmpty>
                        <Text.H6>No results found.</Text.H6>
                      </CommandEmpty>
                      <CommandGroup>
                        {options
                          .filter((option) =>
                            option.label
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                          )
                          .map((option) => (
                            <CommandItem
                              key={option.label}
                              value={option.label} // CommandItem uses value for filtering/search, not the actual select value
                              onSelect={() => {
                                _onChange(option.value as string)
                                // Optionally close the popover after selection
                                // This requires access to the Popover's open state,
                                // which might need further refactoring if desired.
                                setSearchQuery('') // Clear search on select
                              }}
                              className='cursor-pointer flex items-center gap-2'
                            >
                              {option.icon &&
                              typeof option.icon === 'string' ? (
                                <Icon
                                  name={option.icon as IconName}
                                  size='small'
                                />
                              ) : (
                                option.icon
                              )}
                              <Text.H6>{option.label}</Text.H6>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  <SelectGroup hidden>
                    <Options options={options as SelectOption<V>[]} />
                  </SelectGroup>
                </>
              ) : (
                <SelectGroup>
                  <Options options={options as SelectOption<V>[]} />
                </SelectGroup>
              )}
            </SelectContent>
          </SelectRoot>
        )}
      </div>
    </FormField>
  )
}

export * from './Primitives'
