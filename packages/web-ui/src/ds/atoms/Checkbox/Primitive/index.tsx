'use client'

import { ComponentPropsWithoutRef, ElementRef, forwardRef } from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'

import { cn } from '../../../../lib/utils'
import { Icon } from '../../Icons'

export type CheckboxAtomProps = ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
>
export type CheckedState = CheckboxPrimitive.CheckedState
const CheckboxAtom = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxAtomProps
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm',
      'border border-primary focus-visible:outline-none',
      'focus-visible:ring-1 focus-visible:ring-ring ',
      'data-[state=checked]:bg-primary',
      'data-[state=checked]:text-primary-foreground',
      'data-[state=indeterminate]:text-primary',
      'dark:border-foreground data-[state=checked]:dark:bg-foreground',
      'dark:data-[state=checked]:text-background',
      'dark:data-[state=indeterminate]:text-foreground',
      'disabled:cursor-not-allowed disabled:opacity-20',
      'disabled:border-foreground disabled:bg-gray-200 dark:disabled:bg-gray-900',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn('flex items-center justify-center text-current')}
    >
      {props.checked === 'indeterminate' && (
        <Icon name='minus' className='relative -top-[0.3px]' />
      )}
      {props.checked === true && <Icon name='checkClean' />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))

CheckboxAtom.displayName = CheckboxPrimitive.Root.displayName

export { CheckboxAtom }
