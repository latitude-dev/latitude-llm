import { useCallback, useState } from 'react'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@latitude-data/web-ui/atoms/Command'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { cn } from '@latitude-data/web-ui/utils'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'

export type ModelOption = SelectOption<string> & {
  custom?: boolean
}

export function ModelSelector({
  options,
  onChange,
  onSearchChange,
  value: inputValue,
  disabled,
}: {
  options: ModelOption[]
  onChange: (model: string) => void
  onSearchChange: (search: string) => void
  disabled: boolean
  value?: string | null
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const onSelect = useCallback(
    (selectedValue: string) => () => {
      onChange(selectedValue)
      setSearchQuery('')
    },
    [onChange],
  )
  const onValueChange = useCallback(
    (newValue: string) => {
      setSearchQuery(newValue)
      onSearchChange(newValue)
    },
    [onSearchChange],
  )
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase()),
  )
  return (
    <Command value={inputValue ?? ''} className='h-full'>
      <CommandInput
        autoFocus
        placeholder='Search models...'
        value={searchQuery}
        onValueChange={onValueChange}
      />
      <CommandList maxHeight='auto' className='p-1'>
        {filtered.map((option) => (
          <CommandItem
            disabled={disabled}
            key={option.label}
            value={option.label}
            onSelect={onSelect(option.label)}
            className={cn(
              'cursor-pointer flex items-center gap-2',
              'w-full justify-between',
              {
                '!bg-accent': option.value === inputValue,
              },
            )}
          >
            <Text.H6 isItalic={option.custom}>{option.label}</Text.H6>
            {option.custom ? <Badge variant='outline'>Custom</Badge> : null}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}
