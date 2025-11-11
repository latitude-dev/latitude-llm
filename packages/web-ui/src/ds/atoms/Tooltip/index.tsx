'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  ReactNode,
} from 'react'

import { cn } from '../../../lib/utils'
import { TextColor } from '../../tokens'
import { zIndex } from '../../tokens/zIndex'
import { Badge, BadgeProps } from '../Badge'
import { Icon, IconProps } from '../Icons'
import { Text } from '../Text'

const TooltipProvider = TooltipPrimitive.Provider

const TooltipRoot = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

export type TooltipVariant = 'default' | 'destructive' | 'inverse' | 'ghost'
type PropviderProps = ComponentPropsWithoutRef<typeof TooltipProvider>
type RootProps = ComponentPropsWithoutRef<typeof TooltipRoot>
type ContentProps = ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
> & {
  variant?: TooltipVariant
  maxWidth?: string
}
const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ContentProps
>(
  (
    {
      className,
      variant = 'default',
      sideOffset = 4,
      maxWidth = 'max-w-72',
      ...props
    },
    ref,
  ) => (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'overflow-hidden rounded-md text-foreground px-3 py-1.5 text-xs animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        maxWidth,
        className,
        zIndex.tooltip,
        {
          'bg-background border': variant === 'default',
          'bg-destructive': variant === 'destructive',
          'bg-foreground text-background': variant === 'inverse',
          'bg-transparent p-0 rounded-none': variant === 'ghost',
        },
      )}
      {...props}
    />
  ),
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export function useTooltipTextContentColor(variant: TooltipVariant): TextColor {
  switch (variant) {
    case 'default':
      return 'foreground'
    case 'destructive':
      return 'destructiveForeground'
    case 'inverse':
      return 'background'
    case 'ghost':
      return 'foreground'
  }
}

type Props = PropviderProps &
  RootProps &
  ContentProps & {
    trigger?: ReactNode
    children?: ReactNode
    triggerIcon?: IconProps
    triggerBadge?: BadgeProps
    hideWhenEmpty?: boolean
  }
function Tooltip({
  children,
  trigger,
  // Provider
  delayDuration = 200,
  disableHoverableContent,

  // Root
  open,
  defaultOpen,
  onOpenChange,

  // Content
  // Black tooltip by defaul. In dark mode, it will be white
  variant = 'inverse',
  side,
  sideOffset,
  align,
  alignOffset,
  arrowPadding,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  sticky,
  hideWhenDetached,
  updatePositionStrategy,
  maxWidth,
  asChild = false,
  triggerIcon,
  triggerBadge,
  hideWhenEmpty = false,
  className,
}: Props) {
  const textColor = useTooltipTextContentColor(variant)
  const isChildrenString = typeof children === 'string'

  if (hideWhenEmpty && !children) {
    return <>{trigger}</>
  }

  return (
    <TooltipRoot
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
    >
      {!triggerIcon && !triggerBadge ? (
        <TooltipTrigger asChild={asChild}>{trigger}</TooltipTrigger>
      ) : (
        <TooltipTrigger asChild={asChild} className='flex items-center gap-x-2'>
          {trigger}
          {triggerBadge ? <Badge {...triggerBadge} /> : null}
          {triggerIcon ? <Icon {...triggerIcon} /> : null}
        </TooltipTrigger>
      )}
      <TooltipPrimitive.Portal>
        <TooltipContent
          maxWidth={maxWidth}
          variant={variant}
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          arrowPadding={arrowPadding}
          avoidCollisions={avoidCollisions}
          collisionBoundary={collisionBoundary}
          collisionPadding={collisionPadding}
          sticky={sticky}
          hideWhenDetached={hideWhenDetached}
          updatePositionStrategy={updatePositionStrategy}
          className={className}
        >
          {isChildrenString ? (
            <Text.H6B color={textColor}>{children}</Text.H6B>
          ) : (
            children
          )}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </TooltipRoot>
  )
}

export { Tooltip, TooltipProvider }
