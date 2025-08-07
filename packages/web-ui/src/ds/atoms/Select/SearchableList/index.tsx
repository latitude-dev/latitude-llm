import { useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../Command'
import { Text } from '../../Text'
import { Options, SelectGroup, type SelectOption } from '../index'
import { Icon, type IconName } from '../../Icons'

export function SearchableSelectList<V = unknown>({
  options,
  onChange,
}: {
  options: SelectOption<V>[]
  onChange?: (value: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  return (
    <>
      <Command>
        <CommandInput
          autoFocus
          placeholder='Search...'
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>
            <Text.H6>No results found.</Text.H6>
          </CommandEmpty>
          <CommandGroup>
            {options
              .filter((option) => option.label.toLowerCase().includes(searchQuery.toLowerCase()))
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
                    <Icon name={option.icon as IconName} size='small' color='foregroundMuted' />
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
