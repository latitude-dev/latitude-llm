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
import { Button } from '@latitude-data/web-ui/atoms/Button'

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
  const [searchQuery, setSearchQuery] = useState(
    isCustom ? (inputValue ?? '') : '',
  )
  const onSelect = useCallback(
    (selectedValue: string) => () => {
      const isEmpty = isCustom && !selectedValue.trim()
      onChange(isEmpty ? null : selectedValue)
      setSearchQuery('')
    },
    [onChange, isCustom],
  )
  const onValueChange = useCallback(
    (newValue: string) => {
      setSearchQuery(newValue)
      if (isCustom) return

      onSearchChange(newValue)
    },
    [onSearchChange, isCustom],
  )
  const clearValue = useCallback(() => {
    setSearchQuery('')
    onChange('')
  }, [onChange])
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase()),
  )
  return (
    <Command value={inputValue ?? ''} className='h-full'>
      <CommandInput
        autoFocus
        showSearchIcon={!isCustom}
        placeholder={isCustom ? 'Write your model' : 'Search models...'}
        value={searchQuery}
        onValueChange={onValueChange}
      />
      {isCustom ? (
        <div className='flex justify-end p-2 gap-x-2'>
          {searchQuery ? (
            <Button fancy variant='outline' onClick={clearValue}>
              Clear
            </Button>
          ) : null}
          <Button
            fancy
            variant={!searchQuery ? 'secondary' : 'default'}
            onClick={onSelect(searchQuery)}
          >
            Save model
          </Button>
        </div>
      ) : (
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
      )}
    </Command>
  )
}
