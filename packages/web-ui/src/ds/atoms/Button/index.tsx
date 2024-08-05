import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot, Slottable } from '@radix-ui/react-slot'

import { Icon, IconProps } from '$ui/ds/atoms/Icons'
import { cn } from '$ui/lib/utils'

const buttonContainerVariants = cva(
  cn(
    'group relative h-fit',
    'rounded-md inline-flex',
    'disabled:opacity-50 disabled:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        default: 'bg-accent-foreground hover:bg-accent-foreground/90',
        destructive:
          'bg-destructive-muted-foreground hover:bg-destructive-muted-foreground/90',
        outline: 'hover:bg-accent/60',
        secondary: 'bg-secondary hover:bg-secondary/80',
        ghost: 'shadow-none bg-transparent',
        link: 'shadow-none underline-offset-4 hover:underline',
        linkDestructive: 'shadow-none underline-offset-4 hover:underline',
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
        className: 'shadow-[inset_0px_0px_0px_1px_rgb(var(--border)/0.4)]',
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
    'w-full inline-flex items-center justify-center rounded-md text-sm font-sans font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'ring-offset-background',
    'group-disabled:opacity-50 group-disabled:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground group-hover:bg-primary/90 shadow-[inset_0px_2px_2px_rgba(255,255,255,0.25),inset_0px_-1px_4px_rgba(0,0,0,0.04)]',
        destructive:
          'bg-destructive text-destructive-foreground group-hover:bg-destructive/90 shadow-[inset_0px_2px_2px_rgba(255,255,255,0.25),inset_0px_-1px_4px_rgba(0,0,0,0.04)]',
        outline:
          'border border-input group-hover:bg-accent group-hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground group-hover:bg-secondary/80',
        ghost: 'shadow-none bg-transparent text-muted-foreground',
        link: 'shadow-none underline-offset-4 group-hover:underline text-primary',
        linkDestructive:
          'shadow-none underline-offset-4 group-hover:underline text-destructive',
      },
      size: {
        default: 'py-1.5 px-3',
        small: 'py-1 px-1.5',
        none: 'py-0 px-0',
      },
      fanciness: {
        default: '',
        fancy: 'border-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)]',
      },
    },
    compoundVariants: [
      {
        variant: 'outline',
        fanciness: 'fancy',
        className: 'shadow-[inset_0px_0px_0px_1px_rgb(var(--border)/0.4)]',
      },
      {
        size: 'default',
        fanciness: 'fancy',
        className: 'py-1',
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

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    children?: ReactNode
    iconProps?: IconProps
    fullWidth?: boolean
    asChild?: boolean
    isLoading?: boolean
    fancy?: boolean
    lookDisabled?: boolean
  }

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fancy,
    iconProps,
    fullWidth = false,
    asChild = false,
    isLoading,
    children,
    disabled,
    lookDisabled,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  if (!children && !iconProps) {
    throw new Error('Button must have children or iconProps')
  }

  const fanciness = fancy ? 'fancy' : 'default'

  return (
    <Comp
      disabled={disabled || isLoading}
      className={cn('group', buttonContainerVariants({ fanciness, variant }), {
        'w-full': fullWidth,
        'opacity-50': lookDisabled,
      })}
      ref={ref}
      {...props}
    >
      <Slottable>
        <div
          className={cn(
            buttonVariants({ variant, size, className, fanciness }),
          )}
        >
          <div className='flex flex-row items-center gap-x-1'>
            {iconProps ? <Icon {...iconProps} /> : null}
            {children}
          </div>
        </div>
      </Slottable>
    </Comp>
  )
})

export { Button, buttonVariants }
