'use client'

import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '../../../lib/utils'

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & {
    variant?: 'solid' | 'dashed'
  }
>(
  (
    {
      className,
      orientation = 'horizontal',
      decorative = true,
      variant = 'solid',
      ...props
    },
    ref,
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0',
        variant === 'dashed' ? 'border-dashed border-border' : 'bg-border',
        orientation === 'horizontal'
          ? variant === 'dashed'
            ? 'h-0 w-full border-t'
            : 'h-[1px] w-full'
          : variant === 'dashed'
            ? 'h-full w-0 border-l'
            : 'h-full w-[1px]',
        className,
      )}
      {...props}
    />
  ),
)
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }
