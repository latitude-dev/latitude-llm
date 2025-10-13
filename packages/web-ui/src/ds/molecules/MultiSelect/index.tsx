import { forwardRef, KeyboardEvent, ReactNode, useState } from 'react'
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
import { Popover } from '../../atoms/Popover'
import { Text } from '../../atoms/Text'
import { Icon, IconName } from '../../atoms/Icons'

export interface MultiSelectProps {
  options: {
    label: string
    value: string
    icon?: IconName
  }[]
  onChange?: (value: string[]) => void
  value?: string[] // Controlled mode
  defaultValue?: string[] // Uncontrolled mode
  placeholder?: string
  animation?: number
  maxCount?: number
  modalPopover?: boolean
  className?: string
  disabled?: boolean
  size?: 'default' | 'small'
  trigger?: ReactNode
}

// Default trigger component
const DefaultMultiSelectTrigger = forwardRef<
  HTMLButtonElement,
  {
    selectedValues: string[]
    options: MultiSelectProps['options']
    placeholder: string
    maxCount: number
    animation: number
    isAnimating: boolean
    disabled?: boolean
    size: 'default' | 'small'
    className?: string
    onToggleOption: (value: string) => void
    onClear: () => void
    onClearExtraOptions: () => void
    onTogglePopover: () => void
  }
>(
  (
    {
      selectedValues,
      options,
      placeholder,
      maxCount,
      animation,
      isAnimating,
      disabled,
      size,
      className,
      onToggleOption,
      onClear,
      onClearExtraOptions,
      onTogglePopover,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        {...props}
        onClick={onTogglePopover}
        disabled={disabled}
        className={cn(
          'flex w-full rounded-md border items-center justify-between bg-inherit hover:bg-inherit [&_svg]:pointer-events-auto',
          className,
          {
            'py-buttonDefaultVertical px-3 min-h-8': size === 'default',
            'py-0 px-1.5 min-h-6': size === 'small',
          },
        )}
      >
        {selectedValues.length > 0 ? (
          <div className='flex flex-1 justify-between items-center w-full'>
            <div className='flex flex-wrap items-center gap-1'>
              {selectedValues.slice(0, maxCount).map((value) => {
                const option = options.find(
                  (o: { label: string; value: string; icon?: IconName }) =>
                    o.value === value,
                )
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
                      onToggleOption(value)
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
                    onClearExtraOptions()
                  }}
                >
                  <div className='flex items-center gap-2'>
                    <Text.H6>{`+ ${selectedValues.length - maxCount} more`}</Text.H6>
                    <div className='cursor-pointer'>
                      <Icon name='close' size='small' />
                    </div>
                  </div>
                </Badge>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <div
                className='cursor-pointer text-muted-foreground'
                onClick={(event) => {
                  event.stopPropagation()
                  onClear()
                }}
              >
                <Icon name='close' color='foregroundMuted' />
              </div>
              <div className='cursor-pointer text-muted-foreground'>
                <Icon
                  name='chevronsUpDown'
                  size='normal'
                  color='foregroundMuted'
                />
              </div>
            </div>
          </div>
        ) : (
          <div className='flex items-center justify-between w-full'>
            <Text.H5>{placeholder}</Text.H5>
            <Icon name='chevronsUpDown' size='normal' color='foregroundMuted' />
          </div>
        )}
      </button>
    )
  },
)

DefaultMultiSelectTrigger.displayName = 'DefaultMultiSelectTrigger'

export const MultiSelect = forwardRef<HTMLButtonElement, MultiSelectProps>(
  (
    {
      options,
      onChange: onValueChange,
      value: controlledValue,
      defaultValue = [],
      placeholder = 'Select options',
      animation = 0,
      maxCount = 3,
      modalPopover = false,
      className,
      disabled,
      size = 'default',
      trigger,
      ...props
    },
    ref,
  ) => {
    const [internalSelectedValues, setInternalSelectedValues] =
      useState<string[]>(defaultValue)
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)

    // Use controlled value if provided, otherwise use internal state
    const selectedValues =
      controlledValue !== undefined ? controlledValue : internalSelectedValues

    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return
      if (event.key === 'Enter') {
        setIsPopoverOpen(true)
      } else if (event.key === 'Backspace' && !event.currentTarget.value) {
        const newSelectedValues = [...selectedValues]
        newSelectedValues.pop()
        setInternalSelectedValues(newSelectedValues)
        onValueChange?.(newSelectedValues)
      }
    }

    const toggleOption = (option: string) => {
      if (disabled) return
      const newSelectedValues = selectedValues.includes(option)
        ? selectedValues.filter((value) => value !== option)
        : [...selectedValues, option]
      setInternalSelectedValues(newSelectedValues)
      onValueChange?.(newSelectedValues)
    }

    const handleClear = () => {
      if (disabled) return
      setInternalSelectedValues([])
      onValueChange?.([])
    }

    const handleTogglePopover = () => {
      setIsPopoverOpen((prev) => !prev)
    }

    const clearExtraOptions = () => {
      if (disabled) return
      const newSelectedValues = selectedValues.slice(0, maxCount)
      setInternalSelectedValues(newSelectedValues)
      onValueChange?.(newSelectedValues)
    }

    const toggleAll = () => {
      if (disabled) return
      if (selectedValues.length === options.length) {
        handleClear()
      } else {
        const allValues = options.map((option) => option.value)
        setInternalSelectedValues(allValues)
        onValueChange?.(allValues)
      }
    }

    return (
      <Popover.Root
        open={isPopoverOpen}
        onOpenChange={setIsPopoverOpen}
        modal={modalPopover}
      >
        <Popover.Trigger asChild>
          {trigger || (
            <DefaultMultiSelectTrigger
              ref={ref}
              {...props}
              selectedValues={selectedValues}
              options={options}
              placeholder={placeholder}
              maxCount={maxCount}
              animation={animation}
              isAnimating={isAnimating}
              disabled={disabled}
              size={size}
              className={className}
              onToggleOption={toggleOption}
              onClear={handleClear}
              onClearExtraOptions={clearExtraOptions}
              onTogglePopover={handleTogglePopover}
            />
          )}
        </Popover.Trigger>
        <Popover.Content
          size='auto'
          className='p-0 min-w-[240px]'
          align={trigger ? 'end' : 'start'}
          onEscapeKeyDown={() => setIsPopoverOpen(false)}
        >
          <Command>
            <div className='px-1'>
              <CommandInput
                placeholder='Search...'
                onKeyDown={handleInputKeyDown}
                className='text-xs'
                disabled={disabled}
              />
            </div>
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
                      disabled={disabled}
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
                          disabled={disabled}
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
        {animation > 0 && selectedValues.length > 0 && !trigger && (
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
    )
  },
)

MultiSelect.displayName = 'MultiSelect'
