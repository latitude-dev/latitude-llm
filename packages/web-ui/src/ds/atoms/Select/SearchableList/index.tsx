import { useCallback, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../Command'
import { Text } from '../../Text'
import { Options, SelectGroup, SelectOption } from '../index'
import { Icon, IconName } from '../../Icons'

export function SearchableSelectList<V extends unknown = unknown>({
  options,
  onChange,
  onSearchChange,
  searchableEmptyMessage = 'No results found.',
  searchPlaceholder = 'Search...',
  selectedValue,
}: {
  options: SelectOption<V>[]
  onSearchChange?: (query: string) => void
  onChange?: (value: string) => void
  searchableEmptyMessage?: string
  searchPlaceholder?: string
  selectedValue?: V
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const onValueChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      onSearchChange?.(value)
    },
    [onSearchChange],
  )
  return (
    <>
      <Command>
        <CommandInput
          autoFocus
          placeholder={searchPlaceholder}
          value={searchQuery}
          onValueChange={onValueChange}
        />
        <CommandList>
          <CommandEmpty>
            <Text.H6>{searchableEmptyMessage}</Text.H6>
          </CommandEmpty>
          <CommandGroup>
            {options
              .filter((option) => {
                const matchesSearch = option.label
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase())
                const isSelected =
                  selectedValue !== undefined && option.value === selectedValue
                return matchesSearch || isSelected
              })
              .map((option) => (
                <CommandItem
                  key={option.label}
                  value={option.label} // CommandItem uses value for filtering/search, not the actual select value
                  onSelect={() => {
                    onChange?.(option.value as string)
                    // Optionally close the popover after selection
                    // This requires access to the Popover's open state,
                    // which might need further refactoring if desired.
                    setSearchQuery('') // Clear search on select
                  }}
                  className='cursor-pointer flex items-center gap-2'
                >
                  {option.icon && typeof option.icon === 'string' ? (
                    <Icon
                      name={option.icon as IconName}
                      size='small'
                      color='foregroundMuted'
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
  )
}
