'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'
import { ComponentRef, CustomComponentPropsWithRef, forwardRef } from 'react'

import { cn } from '../../../lib/utils'
import { font } from '../../tokens'
import { Badge } from '../Badge'
import { Icon, IconName } from '../Icons'
import { Tooltip } from '../Tooltip'

const labelVariants = cva(
  cn(
    'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default: '',
        destructive: '!text-destructive',
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
  VariantProps<typeof labelVariants> & {
    icon?: IconName
  }
const Label = forwardRef<ComponentRef<typeof LabelPrimitive.Root>, LabelProps>(
  function Label({ children, icon, className, variant, ...props }, ref) {
    return (
      <LabelPrimitive.Root
        ref={ref}
        className={cn(
          labelVariants({ variant }),
          { 'flex flex-row gap-1.5 items-center': !!icon },
          className,
        )}
        {...props}
      >
        {icon && <Icon name={icon} className='flex-shrink-0' />}
        {children}
      </LabelPrimitive.Root>
    )
  },
)

const BatchLabel = ({ children, ...rest }: LabelProps) => (
  <Label {...rest}>
    <Badge variant='accent'>&#123;&#123;{children}&#125;&#125;</Badge>
  </Label>
)

type TooltipLabelProps = LabelProps & {
  badgeLabel?: boolean
  info?: string
  error?: string | undefined
  inline?: boolean
}
export function TooltipLabel({
  badgeLabel,
  info,
  error,
  children,
  inline = false,
  ...rest
}: TooltipLabelProps) {
  const LabelComponent = badgeLabel ? BatchLabel : Label
  if (!info) {
    return (
      <div className='flex flex-row gap-1 items-center'>
        <LabelComponent {...rest}>{children}</LabelComponent>
      </div>
    )
  }

  return (
    <Tooltip
      variant={error ? 'destructive' : 'inverse'}
      asChild
      side='top'
      align='start'
      trigger={
        <div className={cn({ 'inline-flex': inline })}>
          <div className='flex flex-row gap-1 items-center'>
            <LabelComponent
              variant={error ? 'destructive' : 'default'}
              {...rest}
            >
              {children}
            </LabelComponent>
            <Icon
              name='info'
              color={error ? 'destructive' : 'foregroundMuted'}
            />
          </div>
        </div>
      }
    >
      {info}
    </Tooltip>
  )
}

export { BatchLabel, Label }
