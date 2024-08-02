import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot, Slottable } from '@radix-ui/react-slot'

import { Icon, IconProps } from '$ui/ds/atoms/Icons'
import { cn } from '$ui/lib/utils'

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center rounded-md text-sm font-sans font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none ring-offset-background shadow-sm',
    'shadow-[inset_0px_2px_2px_rgba(255,255,255,0.25),inset_0px_-1px_4px_rgba(0,0,0,0.04)]',
  ),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'shadow-none bg-transparent text-muted-foreground',
        link: 'shadow-none underline-offset-4 hover:underline text-primary',
        linkDestructive:
          'shadow-none underline-offset-4 hover:underline text-destructive',
      },
      size: {
        default: 'py-1.5 px-3',
        small: 'py-1 px-1.5',
        none: 'py-0 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
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
  }

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    iconProps,
    fullWidth = false,
    asChild = false,
    isLoading,
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  if (!children && !iconProps) {
    throw new Error('Button must have children or iconProps')
  }

  return (
    <Comp
      disabled={isLoading}
      className={cn(buttonVariants({ variant, size, className }), {
        'w-full': fullWidth,
      })}
      ref={ref}
      {...props}
    >
      <Slottable>
        <div className='flex flex-row items-center gap-x-1'>
          {iconProps ? <Icon {...iconProps} /> : null}
          {children}
        </div>
      </Slottable>
    </Comp>
  )
})

export { Button, buttonVariants }
