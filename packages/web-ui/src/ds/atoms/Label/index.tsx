'use client'

import { CustomComponentPropsWithRef, ElementRef, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '../../../lib/utils'
import { font } from '../../tokens'
import { Badge } from '../Badge'

const labelVariants = cva(
  cn(
    'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default: '',
        destructive: 'text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type LabelProps = CustomComponentPropsWithRef<
  typeof LabelPrimitive.Root
> &
  VariantProps<typeof labelVariants>
const Label = forwardRef<ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  function Label({ className, variant, ...props }, _ref) {
    return (
      <LabelPrimitive.Root
        ref={props.ref}
        className={cn(labelVariants({ variant }), className)}
        {...props}
      />
    )
  },
)

const BatchLabel = ({ children, ...rest }: LabelProps) => (
  <Label {...rest}>
    <Badge variant='accent'>&#123;&#123;{children}&#125;&#125;</Badge>
  </Label>
)

export { Label, BatchLabel }
