import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-primary-foreground/10 bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-secondary-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/80',
        yellow:
          'border-transparent bg-yellow text-foreground hover:bg-yellow/80',
        purple:
          'border-transparent bg-purple text-foreground hover:bg-purple/80',
        accent:
          'border-accent-foreground/10 bg-accent text-accent-foreground hover:bg-accent/80',
        success:
          'border-transparent bg-green-500 text-success-foreground hover:bg-green-500/80',
        destructive:
          'border-destructive-foreground/10 bg-destructive text-destructive-foreground hover:bg-destructive/80',
        muted:
          'border-muted-foreground/10 bg-muted text-muted-foreground hover:bg-muted/80',
        outline: 'text-foreground',
      },
      shape: {
        default: 'max-h-5 py-2 px-1.5',
        square: 'max-h-5 py-2 px-1.5',
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
