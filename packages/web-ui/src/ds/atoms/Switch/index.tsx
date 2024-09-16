'use client'

import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useId,
} from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'

import { cn } from '../../../lib/utils'
import {
  FormControl,
  FormDescription,
  InlineFormErrorMessage,
} from '../FormField'
import { Label } from '../Label'

type ToogleProps = ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
  size?: 'normal'
}
const SwitchToogle = forwardRef<
  ElementRef<typeof SwitchPrimitives.Root>,
  ToogleProps
>(({ className, size = 'normal', ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className,
      {
        'h-4 w-8': size === 'normal',
      },
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block rounded-full bg-background shadow-lg',
        'ring-0 transition-transform data-[state=unchecked]:translate-x-0',
        {
          'h-3 w-3 data-[state=checked]:translate-x-4 ': size === 'normal',
        },
      )}
    />
  </SwitchPrimitives.Root>
))

SwitchToogle.displayName = SwitchPrimitives.Root.displayName

type Props = ToogleProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
    label?: string
    description?: string | ReactNode
    errors?: string[] | null | undefined
  }
function SwitchInput({
  className,
  label,
  errors,
  description,
  ...rest
}: Props) {
  const error = errors?.[0]
  const id = useId()
  const formItemId = `${id}-form-item`
  const formDescriptionId = `${id}-form-item-description`
  const formMessageId = `${id}-form-item-message`
  return (
    <div
      className={cn('flex flex-col gap-y-2 w-full', className)}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
    >
      <div className='flex flex-row items-center gap-x-2 w-full'>
        <FormControl
          error={error}
          formItemId={formItemId}
          formDescriptionId={formDescriptionId}
          formMessageId={formMessageId}
        >
          <SwitchToogle {...rest} />
        </FormControl>
        {label ? (
          <Label
            variant={error ? 'destructive' : 'default'}
            htmlFor={formItemId}
          >
            {label}
          </Label>
        ) : null}
      </div>
      {description && (
        <FormDescription id={formDescriptionId}>{description}</FormDescription>
      )}

      <InlineFormErrorMessage error={error} id={formMessageId} />
    </div>
  )
}

export { SwitchToogle, SwitchInput }