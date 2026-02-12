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
      'border border-input focus-visible:outline-none',
      'focus-visible:ring-1 focus-visible:ring-ring ',

      // Checked
      'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
      'data-[state=checked]:text-primary-foreground',
      'data-[state=indeterminate]:text-primary data-[state=indeterminate]:border-primary',
      'data-[state=indeterminate]:text-primary focus-visible:border-primary',

      // Dark mode (unchecked border only)
      'dark:data-[state=unchecked]:border-muted-foreground',

      // Disabled
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
        <Icon name='minus' className='relative -top-[0.7px]' />
      )}
      {props.checked === true && <Icon name='checkClean' />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))

CheckboxAtom.displayName = CheckboxPrimitive.Root.displayName

export { CheckboxAtom }
