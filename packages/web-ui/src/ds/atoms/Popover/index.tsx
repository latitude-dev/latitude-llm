'use client'

import { forwardRef, ReactNode, Ref } from 'react'
import * as RadixPopover from '@radix-ui/react-popover'

import { cn } from '../../../lib/utils'
import { ButtonProps } from '../Button'
import { IconProps } from '../Icons'
import { TextColor } from '../../tokens'
import { SelectGenericTrigger } from '../SelectGenericTrigger'

type Props = RadixPopover.PopoverContentProps & {
  inPortal?: boolean
  size?: 'small' | 'medium' | 'large'
  scrollable?: boolean
}
const PopoverContent = forwardRef<HTMLDivElement, Props>(function Content(
  {
    inPortal = true,
    scrollable = true,
    size = 'small',
    className = '',
    ...rest
  },
  ref,
) {
  const props = {
    ...rest,
    className: cn(
      className,
      'animate-in fade-in-0 slide-in-from-top-2',
      'bg-background shadow-lg rounded-md',
      'mt-1 border border-border z-20',
      'max-h-96 gap-y-4 flex flex-col',
      {
        'custom-scrollbar': scrollable,
        'max-w-80 p-2': size === 'small',
        'max-w-96 p-4': size === 'medium',
        'max-w-xl p-4': size === 'large',
      },
    ),
  }
  if (!inPortal) return <RadixPopover.Content {...props} />

  return (
    <RadixPopover.Portal>
      <RadixPopover.Content {...props} ref={ref} />
    </RadixPopover.Portal>
  )
})

export const ButtonTrigger = ({
  children,
  color,
  showIcon = true,
  buttonVariant = 'outline',
  className,
  iconProps,
  ref,
}: {
  children: string | ReactNode
  showIcon?: boolean
  buttonVariant?: ButtonProps['variant']
  className?: string
  iconProps?: Pick<IconProps, 'name' | 'color'>
  color?: TextColor
  ref?: Ref<HTMLButtonElement>
}) => {
  return (
    <Popover.Trigger ref={ref}>
      <SelectGenericTrigger
        ref={ref}
        color={color}
        showIcon={showIcon}
        buttonVariant={buttonVariant}
        className={className}
        iconProps={iconProps}
      >
        {children}
      </SelectGenericTrigger>
    </Popover.Trigger>
  )
}

export const Popover = {
  Root: RadixPopover.Root,
  Anchor: RadixPopover.Anchor,
  Trigger: RadixPopover.Trigger,
  ButtonTrigger,
  Portal: RadixPopover.Portal,
  Close: RadixPopover.Close,
  Content: PopoverContent,
}
