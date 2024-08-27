import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        accent:
          'border-transparent bg-accent text-accent-foreground hover:bg-accent/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        muted:
          'border-transparent bg-muted text-muted-foreground hover:bg-muted/80',
        outline: 'text-foreground',
      },
      shape: {
        default: 'px-2.5 py-0.5',
        square: 'p-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      shape: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, shape, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, shape }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
