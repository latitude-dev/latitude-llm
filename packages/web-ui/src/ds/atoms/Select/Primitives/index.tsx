'use client'

import * as SelectPrimitive from '@radix-ui/react-select'
import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { SelectOption, SelectOptionGroup } from '..'
import { cn } from '../../../../lib/utils'
import { Icon, IconName } from '../../Icons'
import { Text } from '../../Text'
import { type SelectProps } from '../index'

const SelectRoot = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValuePrimitive = SelectPrimitive.Value
const SelectTriggerPrimitive = SelectPrimitive.Trigger

function SelectValueWithIcon({
  icon,
  children,
}: {
  icon?: ReactNode | IconName
  children: ReactNode
}) {
  return (
    <div className='w-full flex flex-row items-center gap-x-2 min-w-0 truncate'>
      {typeof icon === 'string' ? <Icon name={icon as IconName} /> : icon}
      {typeof children === 'string' ? <Text.H5>{children}</Text.H5> : children}
    </div>
  )
}

function SelectValueWithDescription({
  description,
  children,
}: {
  description?: string
  children: ReactNode
}) {
  return (
    <div className='w-full flex flex-col items-start gap-x-2 min-w-0 truncate'>
      {typeof description === 'string' ? (
        <span>{description}</span>
      ) : (
        description
      )}
      {children}
    </div>
  )
}

function findSelected(options: SelectOption[], selected: unknown) {
  return options.find((option) => option.value == selected)
}

export function flattenOption(
  optionGroups: SelectOptionGroup[] | SelectOption[],
): SelectOption[] {
  return optionGroups.reduce<SelectOption[]>((acc, option) => {
    if ('options' in option) {
      return [...acc, ...flattenOption(option.options)]
    }
    return [...acc, option]
  }, [])
}

const SelectValue = ({
  selected,
  options,
  placeholder,
}: {
  options: SelectOption[] | SelectOptionGroup[]
  placeholder?: string
  selected: unknown
}) => {
  const flatOptions = useMemo(() => flattenOption(options), [options])
  const [option, setOption] = useState(findSelected(flatOptions, selected))
  useEffect(() => {
    setOption(findSelected(flatOptions, selected))
  }, [selected, flatOptions])

  if (!option)
    return (
      <SelectValuePrimitive placeholder={placeholder} className='opacity-50'>
        {placeholder}
      </SelectValuePrimitive>
    )

  return (
    <SelectValueWithIcon icon={option.icon}>{option.label}</SelectValueWithIcon>
  )
}

type TriggerProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  fullWidth?: boolean
  removable?: boolean
  onRemove?: () => void
  size?: SelectProps['size']
}
const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  TriggerProps
>(
  (
    {
      fullWidth = true,
      removable = false,
      onRemove,
      className,
      children,
      size = 'default',
      ...props
    },
    ref,
  ) => {
    return (
      <SelectPrimitive.Trigger
        ref={ref}
        {...props}
        className={cn(
          'flex items-center justify-between gap-x-1 whitespace-nowrap rounded-lg',
          'border border-border bg-transparent text-sm ring-offset-background',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-offset-2 focus:ring-2 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 bg-background',
          {
            'w-full': fullWidth,
            'py-buttonDefaultVertical px-3 min-h-8': size === 'default',
            'py-0 px-1.5 min-h-6': size === 'small',
          },
          className,
        )}
      >
        <div className='flex flex-row justify-between items-center gap-x-1 min-w-0 w-full'>
          {children}
        </div>
        {!removable ? (
          <SelectPrimitive.Icon asChild>
            <Icon
              name='chevronsUpDown'
              className='min-w-0 flex-none opacity-50'
            />
          </SelectPrimitive.Icon>
        ) : (
          <div
            role='button'
            tabIndex={-1}
            className='min-w-0 flex-none'
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
              onRemove?.()
            }}
          >
            <Icon
              name='close'
              className='opacity-50 cursor-pointer hover:opacity-100 transition-opacity'
            />
          </div>
        )}
      </SelectPrimitive.Trigger>
    )
  },
)
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className,
    )}
    {...props}
  >
    <Icon name='chevronUp' />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className,
    )}
    {...props}
  >
    <Icon name='chevronDown' />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    autoScroll?: boolean
    maxHeightAuto?: boolean
  }
>(
  (
    {
      className,
      children,
      autoScroll = true,
      maxHeightAuto = false,
      position = 'popper',
      ...props
    },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          'min-w-[8rem] relative z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
          {
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:translate-y-1 w-[var(--radix-select-trigger-width)]':
              position === 'popper',
            'max-h-96': !maxHeightAuto,
          },
        )}
        {...props}
      >
        {autoScroll ? (
          <>
            <SelectScrollUpButton />
            <SelectPrimitive.Viewport className='p-1'>
              {children}
            </SelectPrimitive.Viewport>
            <SelectScrollDownButton />
          </>
        ) : (
          children
        )}
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
)
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

type SelectItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
  icon?: ReactNode | IconName
  description?: string
}
const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, icon, children, description, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className='absolute right-2 flex h-3.5 w-3.5 items-center justify-center'>
      <SelectPrimitive.ItemIndicator>
        <Icon name='checkClean' />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectValueWithIcon icon={icon}>
      <SelectValueWithDescription description={description}>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </SelectValueWithDescription>
    </SelectValueWithIcon>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectTriggerPrimitive,
  SelectValue,
  SelectValueWithIcon,
}
