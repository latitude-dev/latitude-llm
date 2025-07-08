import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { font } from '../../tokens'
import { DotIndicator } from '../DotIndicator'
import { DotIndicatorProps } from '../DotIndicator'
import { Icon } from '../Icons'
import { IconProps } from '../Icons'

const buttonContainerVariants = cva(
  cn(
    'group relative h-fit',
    'rounded-md inline-flex',
    'disabled:opacity-50 disabled:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        default: 'bg-accent-button hover:bg-accent-foreground/90',
        nope: 'bg-transparent hover:bg-transparent',
        destructive:
          'bg-destructive-muted-foreground hover:bg-destructive-muted-foreground/90',
        outline: 'bg-secondary hover:bg-secondary/60',
        secondary: 'bg-secondary hover:bg-secondary/80',
        ghost: 'shadow-none bg-transparent',
        link: 'bg-transparent shadow-none underline-offset-4 hover:underline',
        linkOutline: 'shadow-none underline-offset-4 hover:underline',
        linkDestructive: 'shadow-none underline-offset-4 hover:underline',
        shiny: '',
      },
      fanciness: {
        default: 'bg-transparent hover:bg-transparent',
        fancy:
          'border-0 pb-1 active:pb-0 active:mt-1 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)]',
      },
    },
    compoundVariants: [
      {
        variant: 'outline',
        fanciness: 'fancy',
        className: 'shadow-[inset_0px_0px_0px_1px_hsl(var(--input))]',
      },
    ],
    defaultVariants: {
      variant: 'default',
      fanciness: 'default',
    },
  },
)

const buttonVariants = cva(
  cn(
    'w-full inline-flex items-center justify-center rounded-md font-sans font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'ring-offset-background',
    'group-disabled:opacity-50 group-disabled:pointer-events-none',
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground group-hover:bg-primary/90 shadow-[inset_0px_2px_2px_rgba(255,255,255,0.25),inset_0px_-1px_4px_rgba(0,0,0,0.04)]  disabled:cursor-default',
        nope: 'bg-transparent text-primary-foreground group-hover:bg-transparent',
        destructive:
          'bg-destructive text-destructive-foreground group-hover:bg-destructive/90 shadow-[inset_0px_2px_2px_rgba(255,255,255,0.25),inset_0px_-1px_4px_rgba(0,0,0,0.04)]',
        outline:
          'border border-input bg-background group-hover:bg-secondary group-hover:text-secondary-foreground/80',
        secondary:
          'bg-secondary text-secondary-foreground group-hover:bg-secondary/80',
        ghost: 'shadow-none bg-transparent text-muted-foreground',
        link: 'shadow-none underline-offset-4 group-hover:underline text-accent-foreground',
        linkOutline: 'shadow-none underline-offset-4 group-hover:underline',
        linkDestructive:
          'shadow-none underline-offset-4 group-hover:underline text-destructive',
        shiny: cn(
          'bg-accent border-accent group-hover:bg-primary/15 overflow-hidden',
        ),
      },
      size: {
        default: 'py-buttonDefaultVertical px-3',
        small: 'py-0 px-1.5 min-h-6',
        none: 'py-0 px-0',
        icon: 'h-6 w-6',
      },
      fanciness: {
        default: '',
        fancy: 'border-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)]',
      },
    },
    compoundVariants: [
      {
        variant: 'nope',
        className: 'p-0',
      },
      {
        variant: 'shiny',
        size: 'small',
        className: 'rounded-lg px-2',
      },
      {
        variant: 'outline',
        fanciness: 'fancy',
        className: 'shadow-[inset_0px_0px_0px_1px_hsl(var(--input))]',
      },
      {
        size: 'default',
        fanciness: 'fancy',
        className: '!py-1',
      },
      {
        size: 'small',
        fanciness: 'fancy',
        className: 'py-0.5',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      fanciness: 'default',
    },
  },
)

type ButtonIconProps = IconProps & {
  placement?: 'left' | 'right'
}
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    children?: ReactNode
    iconProps?: ButtonIconProps
    fullWidth?: boolean
    asChild?: boolean
    isLoading?: boolean
    fancy?: boolean
    lookDisabled?: boolean
    ellipsis?: boolean
    containerClassName?: string
    innerClassName?: string
    indicator?: DotIndicatorProps
    childrenOnlyText?: boolean
  }

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    containerClassName,
    innerClassName,
    variant,
    size,
    fancy,
    iconProps,
    fullWidth = false,
    asChild = false,
    isLoading,
    children,
    childrenOnlyText = false,
    disabled,
    lookDisabled,
    ellipsis,
    indicator,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  if (!children && !iconProps) {
    throw new Error('Button must have children or iconProps')
  }

  const fanciness = fancy ? 'fancy' : 'default'
  const iconPlacement = iconProps?.placement || 'left'

  return (
    <Comp
      disabled={disabled || isLoading}
      className={cn(
        'group relative',
        buttonContainerVariants({ fanciness, variant }),
        containerClassName,
        {
          'w-full': fullWidth,
          'opacity-50': lookDisabled,
          'overflow-hidden': ellipsis,
          'animate-pulse': isLoading,
        },
      )}
      ref={ref}
      {...props}
    >
      <Slottable>
        <div
          className={cn(
            'relative',
            buttonVariants({ variant, size, className, fanciness }),
            {
              'overflow-hidden': ellipsis,
              'animate-pulse': isLoading,
            },
          )}
        >
          {variant === 'shiny' && (
            <span
              className={cn(
                'absolute inset-0',
                'bg-gradient-to-r from-transparent via-background to-transparent dark:from-transparent',
                'opacity-50 transform -translate-x-full group-hover:animate-shine animate-shine',
              )}
            ></span>
          )}
          <div
            className={cn(
              'flex flex-row items-center gap-x-2 cursor-pointer max-w-full',
              innerClassName,
              {
                'w-full justify-center': fullWidth,
                'overflow-hidden flex-grow min-w-0': ellipsis,
                'animate-pulse': isLoading,
              },
            )}
          >
            {indicator ? <DotIndicator {...indicator} /> : null}
            {iconProps && iconPlacement === 'left' ? (
              <Icon
                {...iconProps}
                className={cn('flex-shrink-0', iconProps.className)}
              />
            ) : null}
            {children ? (
              <div
                className={cn({
                  'flex flex-row items-center w-full': !childrenOnlyText,
                  'flex-grow flex-shrink truncate':
                    !childrenOnlyText && ellipsis,
                  truncate: childrenOnlyText && ellipsis,
                  'justify-center': fullWidth || !iconProps,
                })}
              >
                {children}
              </div>
            ) : null}
            {iconProps && iconPlacement === 'right' ? (
              <Icon
                {...iconProps}
                className={cn('flex-shrink-0', iconProps.className)}
              />
            ) : null}
          </div>
        </div>
      </Slottable>
    </Comp>
  )
})

export { Button, buttonVariants }
