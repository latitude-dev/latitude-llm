// NOTE: DO NOT REMOVE this import React - it's needed for JSX syntax
// This component is used in packages/emails which doesn't have automatic React import
import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../../lib/utils'

const STYLES = {
  variants: {
    variant: {
      default: 'bg-input',
      success: 'bg-primary/60 dark:bg-foreground/90',
      error: 'bg-red-500',
      warning: 'bg-yellow-500',
      destructive: 'bg-destructive',
      muted: 'bg-muted-foreground/50',
      resolved: 'bg-green-500',
      fucksia: 'bg-fuchsia-500', // Not dyslexia btw
      new: 'bg-blue-500',
    },
    size: {
      default: 'w-2 h-2',
      md: 'w-2.5 h-2.5',
    },
  },
}
const indicatorWrapper = cva('', {
  variants: { size: STYLES.variants.size },
  defaultVariants: { size: 'default' },
})

const pulseVariants = cva('rounded-full', {
  variants: { variant: STYLES.variants.variant },
  defaultVariants: {
    variant: 'default',
  },
})
const indicatorVariants = cva(cn('relative rounded-full'), {
  variants: STYLES.variants,
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})

export type DotIndicatorProps = VariantProps<typeof indicatorVariants> & {
  pulse?: boolean
  className?: string
}

export function DotIndicator({
  size,
  variant,
  pulse = false,
  className,
}: DotIndicatorProps) {
  return (
    <div className={cn('relative flex', indicatorWrapper({ size }), className)}>
      <div
        className={cn(
          'absolute inline-flex h-full w-full opacity-75',
          pulseVariants({ variant }),
          {
            'animate-ping': pulse,
          },
        )}
      />
      <div className={cn(indicatorVariants({ variant, size }))} />
    </div>
  )
}
