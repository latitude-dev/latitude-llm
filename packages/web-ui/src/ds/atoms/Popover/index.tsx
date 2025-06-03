'use client'
import { forwardRef, ReactNode, Ref, useCallback } from 'react'
import * as RadixPopover from '@radix-ui/react-popover'

import { cn } from '../../../lib/utils'
import { Button, ButtonProps } from '../Button'
import { Icon } from '../Icons'
import { IconProps } from '../Icons'
import { Text } from '../Text'
import { TextColor } from '../../tokens'
import { isString } from 'lodash-es'
import { zIndex } from '../../tokens/zIndex'

type Props = RadixPopover.PopoverContentProps & {
  inPortal?: boolean
  size?: 'small' | 'medium' | 'large'
  scrollable?: boolean
  maxHeight?: 'normal' | 'none'
  width?: number
}
const PopoverContent = forwardRef<HTMLDivElement, Props>(function Content(
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
      'animate-in fade-in-0 slide-in-from-top-2',
      'bg-background shadow-lg rounded-md',
      'mt-1 border border-border',
      'gap-y-4 flex flex-col',
      className,
      zIndex.popover,
      {
        'custom-scrollbar': scrollable,
        'max-w-80 p-2': size === 'small',
        'max-w-96 p-4': size === 'medium',
        'max-w-xl p-4': size === 'large',
        'max-h-96': maxHeight === 'normal',
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
})

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
  children?: string | ReactNode
  showIcon?: boolean
  buttonVariant?: ButtonProps['variant']
  className?: string
  iconProps?: IconProps
  overrideDarkColor?: string
  color?: TextColor
  ref?: Ref<HTMLButtonElement>
}) => {
  const iconName = iconProps?.name ?? 'chevronsUpDown'
  const iconColor = iconProps?.color ?? 'foregroundMuted'

  const getContent = useCallback(() => {
    if (!children) return <></>
    if (isString(children))
      return (
        <Text.H5 color={color} noWrap ellipsis>
          <div className={overrideDarkColor}>{children}</div>
        </Text.H5>
      )
    return <div className={overrideDarkColor}>{children}</div>
  }, [children, color, overrideDarkColor])

  return (
    <Popover.Trigger ref={ref} asChild>
      <Button variant={buttonVariant} ellipsis className={cn(className)}>
        <div className='flex flex-row justify-between items-center w-full gap-x-2'>
          {getContent()}
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
