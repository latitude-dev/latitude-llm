import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@latitude-data/web-ui/atoms/Command'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import type { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type ModelOption = SelectOption<string> & {
  custom?: boolean
}

export function ModelSelector({
  options,
  onChange,
  onSearchChange,
  value: inputValue,
  disabled,
  isCustom = false,
}: {
  options: ModelOption[]
  onChange: (model: string | null) => void
  onSearchChange: (search: string) => void
  disabled: boolean
  isCustom: boolean
  value?: string | null
}) {
  const [searchQuery, setSearchQuery] = useState('')

  // Initialize search query based on custom provider and current value
  useEffect(() => {
    if (isCustom && inputValue) {
      setSearchQuery(inputValue)
    } else if (!isCustom) {
      setSearchQuery('')
    }
  }, [isCustom, inputValue])

  const onSelect = useCallback(
    (selectedValue: string) => () => {
      const isEmpty = isCustom && !selectedValue.trim()
      onChange(isEmpty ? null : selectedValue)
      if (!isCustom) {
        setSearchQuery('')
      }
    },
    [onChange, isCustom],
  )

  const onValueChange = useCallback(
    (newValue: string) => {
      setSearchQuery(newValue)
      onSearchChange(newValue)
    },
    [onSearchChange],
  )

  // Enhanced options that include current search as custom option when needed
  const enhancedOptions = useMemo(() => {
    const baseOptions = [...options]

    // For custom providers or when search doesn't match any existing option,
    // add the search term as a custom option
    if (searchQuery.trim() && isCustom) {
      const existingOption = baseOptions.find(
        (option) => option.value === searchQuery || option.label === searchQuery,
      )
      if (!existingOption) {
        baseOptions.unshift({
          value: searchQuery,
          label: searchQuery,
          custom: true,
        })
      }
    }

    // Always ensure the current value is available as an option
    if (inputValue?.trim()) {
      const existingOption = baseOptions.find((option) => option.value === inputValue)
      if (!existingOption) {
        baseOptions.unshift({
          value: inputValue,
          label: inputValue,
          custom: true,
        })
      }
    }

    return baseOptions
  }, [options, searchQuery, isCustom, inputValue])

  const filtered = useMemo(
    () =>
      enhancedOptions.filter((option) =>
        option.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [enhancedOptions, searchQuery],
  )

  // For custom providers, individual items should not be disabled if they are custom options
  // For non-custom providers, use the passed disabled state
  const getItemDisabled = useCallback(
    (option: ModelOption) => {
      if (isCustom && option.custom) {
        return false // Custom options in custom providers are always enabled
      }
      return disabled
    },
    [isCustom, disabled],
  )

  return (
    <Command value={inputValue ?? ''} className='h-full'>
      <CommandInput
        autoFocus
        searchIcon={isCustom ? 'plus' : 'search'}
        placeholder={isCustom ? 'Use custom model...' : 'Search models...'}
        value={searchQuery}
        onValueChange={onValueChange}
      />
      <CommandList maxHeight='auto' className='p-1'>
        {filtered.map((option) => (
          <CommandItem
            disabled={getItemDisabled(option)}
            key={option.label}
            value={option.label}
            onSelect={onSelect(option.label)}
            className={cn('cursor-pointer flex items-center gap-2', 'w-full justify-between', {
              '!bg-accent': option.value === inputValue,
            })}
          >
            <Text.H6 isItalic={option.custom}>{option.label}</Text.H6>
            {option.custom && option.value === searchQuery && (
              <span className='flex items-center gap-1'>
                <Text.H6 color='accentForeground'>use</Text.H6>
                <Icon name='arrowRight' color='accentForeground' className='flex-shrink-0' />
              </span>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}
