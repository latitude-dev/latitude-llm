// src/components/multi-select.tsx

import * as React from 'react'

import { cn } from '../../../lib/utils'
import { Badge } from '../../atoms/Badge'
import { Checkbox } from '../../atoms/Checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../atoms/Command'
import { FormField } from '../../atoms/FormField'
import { Popover } from '../../atoms/Popover'
import { Separator } from '../../atoms/Separator'
import { Text } from '../../atoms/Text'
import { Icon, IconName } from '../../atoms/Icons'

interface MultiSelectProps extends Omit<typeof FormField, 'children'> {
  options: {
    label: string
    value: string
    icon?: IconName
  }[]
  required?: boolean
  onChange?: (value: string[]) => void
  defaultValue?: string[]
  placeholder?: string
  animation?: number
  maxCount?: number
  modalPopover?: boolean
  className?: string
  description?: string
  info?: string
  label?: string
  name?: string
  badgeLabel?: boolean
  errors?: string[]
}

export const MultiSelect = React.forwardRef<
  HTMLButtonElement,
  MultiSelectProps
>(
  (
    {
      options,
      onChange: onValueChange,
      required,
      defaultValue = [],
      placeholder = 'Select options',
      description = '',
      animation = 0,
      maxCount = 3,
      modalPopover = false,
      className,
      label,
      badgeLabel,
      info,
      errors,
      name,
      ...props
    },
    ref,
  ) => {
    const [selectedValues, setSelectedValues] =
      React.useState<string[]>(defaultValue)
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)
    const [isAnimating, setIsAnimating] = React.useState(false)

    React.useEffect(() => {
      const form = document.querySelector('form')
      if (form) {
        const handleSubmit = (e: Event) => {
          const formData = new FormData(e.target as HTMLFormElement)
          if (name) {
            formData.set(name, JSON.stringify(selectedValues))
          }
        }
        form.addEventListener('submit', handleSubmit)
        return () => form.removeEventListener('submit', handleSubmit)
      }
    }, [name, selectedValues])

    const handleInputKeyDown = (
      event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
      if (event.key === 'Enter') {
        setIsPopoverOpen(true)
      } else if (event.key === 'Backspace' && !event.currentTarget.value) {
        const newSelectedValues = [...selectedValues]
        newSelectedValues.pop()
        setSelectedValues(newSelectedValues)
        onValueChange?.(newSelectedValues)
      }
    }

    const toggleOption = (option: string) => {
      const newSelectedValues = selectedValues.includes(option)
        ? selectedValues.filter((value) => value !== option)
        : [...selectedValues, option]
      setSelectedValues(newSelectedValues)
      onValueChange?.(newSelectedValues)
    }

    const handleClear = () => {
      setSelectedValues([])
      onValueChange?.([])
    }

    const handleTogglePopover = () => {
      setIsPopoverOpen((prev) => !prev)
    }

    const clearExtraOptions = () => {
      const newSelectedValues = selectedValues.slice(0, maxCount)
      setSelectedValues(newSelectedValues)
      onValueChange?.(newSelectedValues)
    }

    const toggleAll = () => {
      if (selectedValues.length === options.length) {
        handleClear()
      } else {
        const allValues = options.map((option) => option.value)
        setSelectedValues(allValues)
        onValueChange?.(allValues)
      }
    }

    return (
      <FormField
        badgeLabel={badgeLabel}
        label={label}
        info={info}
        description={description}
        errors={errors}
      >
        <div>
          <input
            required={required}
            type='hidden'
            name={name}
            value={JSON.stringify(selectedValues)}
          />

          <Popover.Root
            open={isPopoverOpen}
            onOpenChange={setIsPopoverOpen}
            modal={modalPopover}
          >
            <Popover.Trigger asChild>
              <button
                ref={ref}
                {...props}
                onClick={handleTogglePopover}
                className={cn(
                  'flex w-full p-2 h-8 rounded-md border items-center justify-between bg-inherit hover:bg-inherit [&_svg]:pointer-events-auto overflow-y-auto',
                  className,
                )}
              >
                {selectedValues.length > 0 ? (
                  <div className='flex flex-1 justify-between items-center w-full'>
                    <div className='flex flex-wrap items-center gap-1'>
                      {selectedValues.slice(0, maxCount).map((value) => {
                        const option = options.find((o) => o.value === value)
                        return (
                          <Badge
                            variant='muted'
                            key={value}
                            iconProps={
                              option?.icon
                                ? { name: option.icon, placement: 'start' }
                                : undefined
                            }
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleOption(value)
                            }}
                          >
                            <div className='flex flex-row items-center gap-x-1'>
                              <Text.H6>{option?.label}</Text.H6>
                              <div className='cursor-pointer'>
                                <Icon name='close' size='small' />
                              </div>
                            </div>
                          </Badge>
                        )
                      })}
                      {selectedValues.length > maxCount && (
                        <Badge
                          className={cn(
                            'bg-transparent text-foreground border-foreground/1 hover:bg-transparent',
                            isAnimating ? 'animate-bounce' : '',
                          )}
                          style={{ animationDuration: `${animation}s` }}
                          onClick={(event) => {
                            event.stopPropagation()
                            clearExtraOptions()
                          }}
                        >
                          <Text.H6>{`+ ${selectedValues.length - maxCount} more`}</Text.H6>
                          <div className='cursor-pointer'>
                            <Icon name='close' size='small' />
                          </div>
                        </Badge>
                      )}
                    </div>
                    <div className='flex items-center gap-2'>
                      <div
                        className='cursor-pointer text-muted-foreground'
                        onClick={(event) => {
                          event.stopPropagation()
                          handleClear()
                        }}
                      >
                        <Icon
                          name='close'
                          size='small'
                          color='foregroundMuted'
                        />
                      </div>
                      <Separator
                        orientation='vertical'
                        className='flex min-h-6 h-full'
                      />
                      <div className='cursor-pointer text-muted-foreground'>
                        <Icon
                          name='chevronDown'
                          size='normal'
                          color='foregroundMuted'
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className='flex items-center justify-between w-full'>
                    <Text.H6 color='foregroundMuted'>{placeholder}</Text.H6>
                    <div className='cursor-pointer text-muted-foreground px-2'>
                      <Icon
                        name='chevronDown'
                        size='normal'
                        color='foregroundMuted'
                      />
                    </div>
                  </div>
                )}
              </button>
            </Popover.Trigger>
            <Popover.Content
              className='w-auto p-0'
              align='start'
              onEscapeKeyDown={() => setIsPopoverOpen(false)}
            >
              <Command>
                <CommandInput
                  placeholder='Search...'
                  onKeyDown={handleInputKeyDown}
                  className='text-xs'
                />
                <CommandList>
                  <CommandEmpty>
                    <Text.H6>No results found.</Text.H6>
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      key='all'
                      onSelect={toggleAll}
                      className='cursor-pointer'
                    >
                      <div>
                        <Checkbox
                          checked={selectedValues.length === options.length}
                          onChange={toggleAll}
                        />
                      </div>
                      <Text.H6>(Select All)</Text.H6>
                    </CommandItem>
                    {options.map((option) => {
                      const isSelected = selectedValues.includes(option.value)
                      return (
                        <CommandItem
                          key={option.value}
                          onSelect={() => toggleOption(option.value)}
                          className='cursor-pointer'
                        >
                          <div>
                            <Checkbox
                              checked={isSelected}
                              onChange={() => toggleOption(option.value)}
                            />
                          </div>
                          {option.icon && (
                            <Icon
                              name={option.icon}
                              size='small'
                              color='foregroundMuted'
                              className='w-4'
                            />
                          )}
                          <Text.H6>{option.label}</Text.H6>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </Popover.Content>
            {animation > 0 && selectedValues.length > 0 && (
              <div
                className={cn(
                  'cursor-pointer py-2 text-foreground bg-background',
                  isAnimating ? '' : 'text-muted-foreground',
                )}
                onClick={() => setIsAnimating(!isAnimating)}
              >
                <Icon
                  name='sparkles'
                  size='small'
                  color={isAnimating ? 'foreground' : 'foregroundMuted'}
                />
              </div>
            )}
          </Popover.Root>
        </div>
      </FormField>
    )
  },
)

MultiSelect.displayName = 'MultiSelect'
