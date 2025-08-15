'use client'
import { forwardRef, ReactNode, Ref } from 'react'
import * as RadixPopover from '@radix-ui/react-popover'

import { cn } from '../../../lib/utils'
import { Button, ButtonProps } from '../Button'
import { Icon } from '../Icons'
import { IconProps } from '../Icons'
import { Text } from '../Text'
import { TextColor } from '../../tokens'
import { isString } from 'lodash-es'
import { zIndex } from '../../tokens/zIndex'

export type PopoverContentProps = RadixPopover.PopoverContentProps & {
  inPortal?: boolean
  size?: 'small' | 'medium' | 'large' | 'auto'
  scrollable?: boolean
  maxHeight?: 'normal' | 'none'
  width?: number
}
const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  function Content(
    {
      inPortal = true,
      scrollable = true,
      size = 'small',
      className = '',
      maxHeight = 'normal',
      width,
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
        'mt-1 border border-border',
        'gap-y-4 flex flex-col',
        zIndex.popover,
        {
          'custom-scrollbar': scrollable,
          'max-w-80 p-2': size === 'small',
          'max-w-96 p-4': size === 'medium',
          'max-w-xl p-4': size === 'large',
          'max-h-96': maxHeight === 'normal',
          'w-[var(--radix-popover-trigger-width)]': size === 'auto',
        },
      ),
      style: {
        ...rest.style,
        ...(width ? { minWidth: width, maxWidth: width } : {}),
      },
    }
    if (!inPortal) return <RadixPopover.Content {...props} />

    return (
      <RadixPopover.Portal>
        <RadixPopover.Content {...props} ref={ref} />
      </RadixPopover.Portal>
    )
  },
)

export const ButtonTrigger = ({
  color,
  overrideDarkColor,
  children,
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
  overrideDarkColor?: string
  color?: TextColor
  ref?: Ref<HTMLButtonElement>
}) => {
  const iconName = iconProps?.name ?? 'chevronsUpDown'
  const iconColor = iconProps?.color ?? 'foregroundMuted'
  return (
    <Popover.Trigger ref={ref} asChild>
      <Button variant={buttonVariant} ellipsis className={cn(className)}>
        <div className='flex flex-row justify-between items-center w-full gap-x-2'>
          {isString(children) ? (
            <Text.H5 color={color} noWrap ellipsis>
              <div className={overrideDarkColor}>{children}</div>
            </Text.H5>
          ) : (
            <div className={overrideDarkColor}>{children}</div>
          )}
          {showIcon ? (
            <div className='flex-none'>
              <Icon name={iconName} color={iconColor} />
            </div>
          ) : null}
        </div>
      </Button>
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
