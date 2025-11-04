'use client'

import { ReactNode, useEffect, useState } from 'react'
import { cn } from '../../../lib/utils'
import { zIndex } from '../../tokens/zIndex'
import { FormField, type FormFieldProps } from '../FormField'
import { Icon, IconName } from '../Icons'
import { Skeleton } from '../Skeleton'
import { Text } from '../Text'
import {
  SelectContent,
  type SelectContentProps,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from './Primitives'
import { SearchableSelectList } from './SearchableList'

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
  return options.map((option, key) => (
    <SelectItem key={key} value={String(option.value)} icon={option.icon}>
      {option.label}
    </SelectItem>
  ))
}

export type SelectProps<V extends unknown = unknown> = Omit<
  FormFieldProps,
  'children'
> &
  Pick<SelectContentProps, 'align'> & {
    name: string
    options: SelectOption<V>[]
    defaultValue?: V
    value?: V
    trigger?: ReactNode
    placeholder?: string
    placeholderIcon?: IconName
    loading?: boolean
    disabled?: boolean
    required?: boolean
    onChange?: (value: V) => void
    width?: 'auto' | 'full'
    size?: 'small' | 'default'
    removable?: boolean
    searchable?: boolean
    searchPlaceholder?: string
    searchableEmptyMessage?: string
    onSearch?: (search: string) => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
    footerAction?: {
      label: string
      icon?: IconName
      onClick: () => void
    }
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
  placeholderIcon,
  options,
  defaultValue,
  value,
  info,
  onChange,
  width = 'full',
  size = 'default',
  align = 'start',
  loading = false,
  disabled = false,
  required = false,
  removable = false,
  searchable = false,
  searchableEmptyMessage,
  onSearch,
  searchPlaceholder,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  footerAction,
}: SelectProps<V>) {
  const [selectedValue, setSelected] = useState<V | undefined>(
    value ?? defaultValue,
  )
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  // Use controlled state if provided, otherwise use internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalIsOpen
  const setIsOpen = controlledOnOpenChange ?? setInternalIsOpen

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
          <Skeleton
            className={cn('h-8 rounded-md', {
              'min-w-28': width === 'auto',
              'w-full': width === 'full',
            })}
          />
        ) : (
          <SelectRoot
            open={isOpen}
            required={required}
            disabled={disabled || loading}
            name={name}
            value={selectedValue as string}
            defaultValue={defaultValue as string}
            onValueChange={searchable ? undefined : _onChange}
            onOpenChange={setIsOpen}
          >
            {trigger ? (
              trigger
            ) : (
              <SelectTrigger
                autoFocus={autoFocus}
                size={size}
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
                  placeholderIcon={placeholderIcon}
                />
              </SelectTrigger>
            )}
            <SelectContent align={align} className={cn(zIndex.dropdown, 'p-0')}>
              {searchable ? (
                <SearchableSelectList<V>
                  options={options}
                  onChange={_onChange}
                  onSearchChange={onSearch}
                  searchPlaceholder={searchPlaceholder}
                  searchableEmptyMessage={searchableEmptyMessage}
                  selectedValue={selectedValue}
                />
              ) : (
                <SelectGroup>
                  <Options options={options as SelectOption<V>[]} />
                </SelectGroup>
              )}
              {footerAction ? (
                <div className='border-t border-border pt-1'>
                  <button
                    onClick={footerAction.onClick}
                    className={cn(
                      'cursor-pointer flex items-center justify-center',
                      'gap-2 py-1.5 px-2 w-full rounded-b-lg bg-muted hover:bg-accent',
                    )}
                  >
                    {footerAction.icon ? (
                      <Icon
                        name={footerAction.icon}
                        size='small'
                        color='foregroundMuted'
                      />
                    ) : null}
                    <Text.H6>{footerAction.label}</Text.H6>
                  </button>
                </div>
              ) : null}
            </SelectContent>
          </SelectRoot>
        )}
      </div>
    </FormField>
  )
}

export * from './Primitives'
