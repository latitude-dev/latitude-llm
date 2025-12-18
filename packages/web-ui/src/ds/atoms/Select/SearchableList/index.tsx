import { useCallback, useMemo, useState } from 'react'
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
import { Tooltip } from '../../Tooltip'

function SearchableItemText<V extends unknown = unknown>({
  label,
  icon,
}: {
  icon: SelectOption<V>['icon']
  label: SelectOption<V>['label']
}) {
  return (
    <>
      {icon && typeof icon === 'string' ? (
        <Icon name={icon as IconName} size='small' color='foregroundMuted' />
      ) : (
        icon
      )}
      <Text.H6>{label}</Text.H6>
    </>
  )
}

function SearchableItem<V extends unknown = unknown>({
  label,
  icon,
  hoverDescription,
}: {
  icon: SelectOption<V>['icon']
  label: SelectOption<V>['label']
  hoverDescription?: SelectOption<V>['hoverDescription']
}) {
  if (!hoverDescription) return <SearchableItemText label={label} icon={icon} />

  return (
    <Tooltip
      side='right'
      align='end'
      trigger={<SearchableItemText label={label} icon={icon} />}
    >
      {hoverDescription}
    </Tooltip>
  )
}

export function SearchableSelectList<V extends unknown = unknown>({
  options,
  onChange,
  onSearchChange,
  searchableEmptyMessage = 'No results found.',
  searchPlaceholder = 'Search...',
  selectedValue,
  loading = false,
}: {
  options: SelectOption<V>[]
  onSearchChange?: (query: string) => void
  onChange?: (value: string) => void
  searchableEmptyMessage?: string
  searchPlaceholder?: string
  selectedValue?: V
  loading?: boolean
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const isServerSideSearch = !!onSearchChange
  const onValueChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      onSearchChange?.(value)
    },
    [onSearchChange],
  )

  const filteredOptions = useMemo(
    () =>
      isServerSideSearch
        ? options
        : options.filter((option) => {
            const matchesSearch = option.label
              .toLowerCase()
              .includes(searchQuery.toLowerCase())
            const isSelected =
              selectedValue !== undefined && option.value === selectedValue
            return matchesSearch || isSelected
          }),
    [isServerSideSearch, options, searchQuery, selectedValue],
  )

  return (
    <>
      <Command shouldFilter={false}>
        <CommandInput
          autoFocus
          placeholder={searchPlaceholder}
          value={searchQuery}
          onValueChange={onValueChange}
          loading={loading}
        />
        <CommandList>
          <CommandEmpty>
            <Text.H6>{searchableEmptyMessage}</Text.H6>
          </CommandEmpty>
          <CommandGroup>
            {filteredOptions.map((option) => (
              <CommandItem
                key={option.label}
                value={option.label}
                onSelect={() => {
                  onChange?.(option.value as string)
                  setSearchQuery('')
                }}
                className='cursor-pointer flex items-center gap-2'
              >
                <SearchableItem
                  label={option.label}
                  icon={option.icon}
                  hoverDescription={option.hoverDescription}
                />
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
