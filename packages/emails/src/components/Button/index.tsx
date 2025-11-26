import React from 'react'
import { cn } from '@latitude-data/web-ui/utils'
import { Button as EmailButton } from '@react-email/components'
import { cva, type VariantProps } from 'class-variance-authority'
import { ComponentProps, ReactNode } from 'react'

/**
 * Shadow layer variants for the double-layer effect
 * Creates a small shadow layer underneath the button
 */
const containerVariants = cva('inline-block rounded-lg border pb-1', {
  variants: {
    variant: {
      default: 'bg-primary-dark-1 border-primary-dark-2',
      outline: 'bg-[rgba(0,0,0,0.05)] border-border',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

/**
 * Email button variants using CVA
 * Note: Uses @react-email/components Button which handles email client compatibility
 * No hover states or interactive effects as they don't work reliably in emails
 * Interior height is 34px, max total height with shadow is 38px (34px + 4px shadow)
 * Uses padding and line-height for vertical centering instead of flexbox for email compatibility
 */
const buttonVariants = cva(
  cn(
    'inline-block text-center font-medium rounded-lg no-underline',
    'text-sm leading-5',
  ),
  {
    variants: {
      variant: {
        default: 'bg-primary text-white border-[rgba(0,0,0,0.15)]',
        outline: 'bg-white text-foreground',
      },
      size: {
        default: 'py-[5px] px-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = Omit<
  ComponentProps<typeof EmailButton>,
  'className'
> &
  VariantProps<typeof buttonVariants> & {
    children: ReactNode
    href: string
  }

/**
 * Email-safe button component with 3D effect
 * Uses a separate shadow layer div underneath the button instead of nested wrapper
 * This avoids overflow issues while maintaining the 3D appearance
 */
export function Button({ variant, size, children, ...props }: ButtonProps) {
  return (
    <div className={containerVariants({ variant })}>
      <EmailButton className={cn(buttonVariants({ variant, size }))} {...props}>
        {children}
      </EmailButton>
    </div>
  )
}

export { buttonVariants }
