import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { ButtonHTMLAttributes, forwardRef, ReactNode, useMemo } from 'react'

import { cn } from '../../../lib/utils'
import { font, TextColor } from '../../tokens'
import { DotIndicator, DotIndicatorProps } from '../DotIndicator'
import { Icon, IconProps } from '../Icons'
import { Text } from '../Text'

const buttonContainerVariants = cva(
  cn(
    'group relative',
    'rounded-lg inline-flex',
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
        outlineDestructive: 'bg-destructive-muted',
        secondary: 'bg-secondary hover:bg-secondary/80 ',
        ghost: 'shadow-none bg-transparent',
        link: 'bg-transparent shadow-none underline-offset-4 hover:underline',
        linkOutline: 'shadow-none underline-offset-4 hover:underline',
        linkDestructive: 'shadow-none underline-offset-4 hover:underline',
        shiny: '',
        shinyLatte: '',
        // TODO: apply a color token for this
        latte: 'bg-[#E5B217] hover:bg-[#E5B217]/90 border-latte-border',
        primaryMuted: 'bg-primary-muted hover:bg-primary-muted-hover',
        destructiveMuted: 'bg-destructive-muted',
        successMuted: 'bg-success-muted',
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
      {
        variant: 'outlineDestructive',
        fanciness: 'fancy',
        className:
          'shadow-[inset_0px_0px_0px_1px_hsl(var(--destructive)_/_0.5)] dark:shadow-[inset_0px_0px_0px_1px_hsl(var(--foreground))]',
      },
      {
        variant: 'latte',
        className: 'shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)]',
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
    'w-full inline-flex items-center justify-center rounded-lg font-sans font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'ring-offset-background',
    'group-disabled:opacity-50 group-disabled:pointer-events-none',
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default:
          'border border-transparent bg-primary text-primary-foreground group-hover:bg-primary/90 disabled:cursor-default',
        nope: 'bg-transparent text-primary-foreground group-hover:bg-transparent',
        destructive:
          'bg-destructive text-destructive-foreground group-hover:bg-destructive/90',
        outline:
          'border border-input bg-background group-hover:bg-secondary group-hover:text-secondary-foreground/80',
        outlineDestructive:
          'border border-destructive text-destructive-foreground dark:text-foreground',
        secondary:
          'border border-transparent bg-secondary text-secondary-foreground group-hover:bg-secondary/80',
        ghost:
          'border border-transparent shadow-none bg-transparent text-muted-foreground',
        link: 'shadow-none underline-offset-4 group-hover:underline text-accent-foreground',
        linkOutline: 'shadow-none underline-offset-4 group-hover:underline',
        linkDestructive:
          'shadow-none underline-offset-4 group-hover:underline text-destructive',
        shiny: cn(
          'bg-accent border border-accent group-hover:bg-primary/15 overflow-hidden',
        ),
        shinyLatte: cn(
          'bg-latte-input border border-latte-widget group-hover:bg-latte/15 text-latte-input-foreground overflow-hidden',
        ),
        latte:
          'bg-latte text-latte-input-foreground group-hover:bg-latte/90 border-latte-border',
        primaryMuted:
          'border border-transparent bg-primary-muted text-primary group-hover:bg-primary-muted-hover',
        destructiveMuted:
          'border border-destructive-muted-foreground/10 bg-destructive-muted text-destructive-muted-foreground',
        successMuted:
          'border border-success-muted-foreground/10 bg-success-muted text-success-muted-foreground',
      },
      size: {
        default: 'py-buttonDefaultVertical px-3 min-h-8',
        small: 'py-0 px-1.5 min-h-7',
        tiny: 'py-0 px-1.5 min-h-6',
        none: 'py-0 px-0',
        iconDefault: 'h-8 w-8',
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
        variant: 'shinyLatte',
        size: 'small',
        className: 'rounded-lg px-2',
      },
      {
        variant: 'shinyLatte',
        size: 'tiny',
        className: 'rounded-lg px-1.5',
      },
      {
        variant: 'outline',
        fanciness: 'fancy',
        className: 'shadow-[inset_0px_0px_0px_1px_hsl(var(--input))]',
      },
      {
        variant: 'outlineDestructive',
        fanciness: 'fancy',
        className:
          'bg-white/90 dark:bg-transparent shadow-[inset_0px_0px_0px_1px_hsl(var(--destructive)_/_0.5)] dark:shadow-[inset_0px_0px_0px_1px_hsl(var(--foreground))]',
      },
      {
        fanciness: 'fancy',
        className: 'py-0.5',
      },
      {
        variant: 'latte',
        className: 'shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.2)]',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      fanciness: 'default',
    },
  },
)

const textColorVariants = ({
  variant,
}: {
  variant: ButtonProps['variant']
}): TextColor => {
  if (variant === 'destructive') return 'destructiveForeground'
  if (variant === 'default') return 'white'
  if (variant === 'secondary') return 'secondaryForeground'
  if (variant === 'link') return 'accentForeground'
  if (variant === 'linkOutline') return 'accentForeground'
  if (variant === 'linkDestructive') return 'destructive'
  if (variant === 'shiny') return 'accentForeground'
  if (variant === 'latte') return 'latteInputForeground'
  if (variant === 'primaryMuted') return 'primary'
  if (variant === 'outlineDestructive') return 'destructive'
  if (variant === 'destructiveMuted') return 'destructiveMutedForeground'
  if (variant === 'successMuted') return 'successMutedForeground'
  return 'foreground'
}

type ButtonIconProps = IconProps & {
  placement?: 'left' | 'right'
}
export type ButtonStylesProps = VariantProps<typeof buttonVariants> & {
  containerClassName?: string
  className?: string
  innerClassName?: string
  lookDisabled?: boolean
  fullWidth?: boolean
  isLoading?: boolean
  ellipsis?: boolean
  roundy?: boolean
}
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonStylesProps & {
    children?: ReactNode
    iconProps?: ButtonIconProps
    asChild?: boolean
    fancy?: boolean
    roundy?: boolean
    indicator?: DotIndicatorProps
    childrenOnlyText?: boolean
    userSelect?: boolean
    textColor?: TextColor
  }

export function useButtonStyles({
  variant,
  size,
  fanciness,
  roundy,
  fullWidth,
  containerClassName,
  className,
  innerClassName,
  isLoading,
  lookDisabled,
  ellipsis,
}: ButtonStylesProps) {
  return useMemo(() => {
    return {
      container: cn(
        'group relative',
        buttonContainerVariants({ fanciness, variant }),
        containerClassName,
        {
          'w-full': fullWidth,
          'opacity-50 cursor-not-allowed': lookDisabled,
          'overflow-hidden': ellipsis,
          'animate-pulse': isLoading,
          '!rounded-[0.55rem]': roundy,
        },
      ),
      buttonClass: cn(
        'relative',
        buttonVariants({ variant, size, className, fanciness }),
        {
          'overflow-hidden': ellipsis,
          'animate-pulse': isLoading,
          'cursor-not-allowed': lookDisabled,
          '!rounded-[0.55rem]': roundy,
        },
      ),
      innerButtonClass: cn(
        'flex flex-row items-center gap-x-1.5 cursor-pointer max-w-full',
        innerClassName,
        {
          'w-full justify-center': fullWidth,
          'overflow-hidden flex-grow min-w-0': ellipsis,
          'animate-pulse': isLoading,
          'cursor-not-allowed': lookDisabled,
          '!rounded-[0.55rem]': roundy,
        },
      ),
    }
  }, [
    variant,
    size,
    fanciness,
    roundy,
    containerClassName,
    className,
    innerClassName,
    ellipsis,
    fullWidth,
    lookDisabled,
    isLoading,
  ])
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    containerClassName,
    innerClassName,
    variant = 'default',
    size,
    fancy,
    roundy,
    textColor,
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
    userSelect = true,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  if (!children && !iconProps) {
    throw new Error('Button must have children or iconProps')
  }

  const iconPlacement = iconProps?.placement || 'left'
  const fanciness = fancy ? 'fancy' : 'default'
  const buttonStyles = useButtonStyles({
    variant,
    size,
    fanciness,
    roundy,
    fullWidth,
    containerClassName,
    className,
    innerClassName,
    isLoading,
    lookDisabled,
    ellipsis,
  })

  return (
    <Comp
      ref={ref}
      disabled={disabled || isLoading}
      className={buttonStyles.container}
      {...props}
    >
      <Slottable>
        <div className={buttonStyles.buttonClass}>
          {variant?.startsWith('shiny') && (
            <span
              className={cn(
                'absolute inset-0',
                'bg-gradient-to-r from-transparent via-background to-transparent dark:from-transparent',
                'opacity-50 transform -translate-x-full group-hover:animate-shine animate-shine',
              )}
            />
          )}
          <div className={buttonStyles.innerButtonClass}>
            {indicator ? <DotIndicator {...indicator} /> : null}
            {iconProps && iconPlacement === 'left' ? (
              <Icon
                {...iconProps}
                color={
                  textColor ??
                  iconProps?.color ??
                  textColorVariants({ variant })
                }
                className={cn('flex-shrink-0', iconProps.className)}
              />
            ) : null}

            {typeof children === 'string' ? (
              <Text.H5B
                noWrap
                color={textColor ?? textColorVariants({ variant })}
              >
                {children}
              </Text.H5B>
            ) : children ? (
              <div
                className={cn({
                  'flex flex-row items-center w-full': !childrenOnlyText,
                  'flex-grow flex-shrink truncate':
                    !childrenOnlyText && ellipsis,
                  truncate: childrenOnlyText && ellipsis,
                  'justify-center': fullWidth || !iconProps,
                  'select-none': !userSelect,
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
