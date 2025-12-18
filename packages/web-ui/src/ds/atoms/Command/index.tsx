'use client'

import {
  useCallback,
  ElementRef,
  WheelEvent,
  HTMLAttributes,
  ComponentPropsWithoutRef,
  forwardRef,
} from 'react'
import { Dialog, DialogContent, type DialogProps } from '@radix-ui/react-dialog'
import { Command as CommandPrimitive } from 'cmdk'
import { cn } from '../../../lib/utils'
import { Icon, IconName } from '../Icons'

type CommandProps = ComponentPropsWithoutRef<typeof CommandPrimitive> & {
  unstyled?: boolean
}
const Command = forwardRef<ElementRef<typeof CommandPrimitive>, CommandProps>(
  ({ className, unstyled = false, ...props }, ref) => (
    <CommandPrimitive
      ref={ref}
      className={cn('flex h-full w-full flex-col overflow-hidden ', className, {
        'rounded-md bg-popover text-popover-foreground': !unstyled,
      })}
      {...props}
    />
  ),
)
Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({ children, ...props }: DialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className='overflow-hidden p-0 shadow-lg'>
        <Command className='[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5'>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

type CommandInputProps = ComponentPropsWithoutRef<
  typeof CommandPrimitive.Input
> & {
  searchIcon?: IconName | null
  loading?: boolean
}
const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  CommandInputProps
>(({ className, searchIcon = 'search', loading = false, ...props }, ref) => (
  <div
    className='flex items-center border-b px-1 gap-x-1'
    cmdk-input-wrapper=''
  >
    {!!searchIcon && (
      <Icon name={searchIcon} className='h-4 w-4 shrink-0 opacity-50' />
    )}
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex w-full rounded-md bg-transparent h-8 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
    {loading && (
      <Icon name='loader' spin className='h-4 w-4 shrink-0 opacity-50' />
    )}
  </div>
))

CommandInput.displayName = CommandPrimitive.Input.displayName

type CommandListProps = ComponentPropsWithoutRef<
  typeof CommandPrimitive.List
> & {
  maxHeight?: 'auto' | '300'
}
const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  CommandListProps
>(({ className, maxHeight = '300', ...props }, ref) => {
  const allowScrollWithMouse = useCallback(
    (e: WheelEvent<HTMLDivElement>) => e.stopPropagation(),
    [],
  )
  return (
    <CommandPrimitive.List
      ref={ref}
      onWheel={allowScrollWithMouse}
      className={cn(
        'overflow-y-auto custom-scrollbar overflow-x-hidden outline-none',
        className,
        {
          'max-h-[300px]': maxHeight === '300',
        },
      )}
      {...props}
    />
  )
})

CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className='py-6 text-center text-sm'
    {...props}
  />
))

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

type CommandGroupProps = ComponentPropsWithoutRef<typeof CommandPrimitive> & {
  unstyled?: boolean
}
const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  CommandGroupProps
>(({ className, unstyled = false, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn('overflow-hidden', className, {
      'p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground':
        !unstyled,
    })}
    {...props}
  />
))

CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = forwardRef<
  ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border', className)}
    {...props}
  />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

export function useCommandItemStyles({
  unstyled,
  className,
}: {
  className?: string
  unstyled?: boolean
} = {}) {
  return cn(
    'data-[disabled=true]:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    'data-[disabled=true]:opacity-50 outline-none select-none',
    {
      "relative flex cursor-default gap-2 items-center rounded-sm px-2 py-1.5 text-sm data-[selected='true']:bg-muted data-[selected=true]:text-accent-foreground":
        !unstyled,
    },
    className,
  )
}

type CommandItemProps = ComponentPropsWithoutRef<
  typeof CommandPrimitive.Item
> & {
  unstyled?: boolean
}

const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  CommandItemProps
>(({ className, unstyled = false, ...props }, ref) => {
  const classes = useCommandItemStyles({ className, unstyled })
  return <CommandPrimitive.Item ref={ref} className={classes} {...props} />
})

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
CommandShortcut.displayName = 'CommandShortcut'

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
