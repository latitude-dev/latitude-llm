import {
  ComponentPropsWithRef,
  ElementRef,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useId,
} from 'react'
import { Slot } from '@radix-ui/react-slot'

import { Label } from '$ui/ds/atoms/Label'
import { cn } from '$ui/lib/utils'

function FormDescription({
  id,
  children,
  ...props
}: {
  id: string
  children: string | ReactNode
} & HTMLAttributes<HTMLParagraphElement>) {
  if (typeof children !== 'string') return children

  return (
    <p id={id} className='text-[0.8rem] text-muted-foreground' {...props}>
      {children}
    </p>
  )
}

function FormMessage({ error, id }: { id: string; error: string | undefined }) {
  if (!error) return null

  return (
    <p id={id} className='text-[0.8rem] font-medium text-destructive'>
      {error}
    </p>
  )
}

const FormControl = forwardRef<
  ElementRef<typeof Slot>,
  ComponentPropsWithRef<typeof Slot> & {
    error?: string | undefined
    formItemId: string
    formDescriptionId: string
    formMessageId: string
  }
>(({ error, formItemId, formMessageId, formDescriptionId, ...props }, _ref) => {
  return (
    <Slot
      ref={props.ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
})

export type FormFieldProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> & {
  children: ReactNode
  label?: string
  description?: string | ReactNode
  errors?: string[] | null | undefined
}
function FormField({
  children,
  label,
  description,
  className,
  errors,
}: FormFieldProps) {
  const error = errors?.[0]
  const id = useId()
  const formItemId = `${id}-form-item`
  const formDescriptionId = `${id}-form-item-description`
  const formMessageId = `${id}-form-item-message`

  return (
    <div
      className={cn('space-y-2 w-full', className)}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
    >
      {label ? (
        <Label variant={error ? 'destructive' : 'default'} htmlFor={formItemId}>
          {label}
        </Label>
      ) : null}
      <FormControl
        error={error}
        formItemId={formItemId}
        formDescriptionId={formDescriptionId}
        formMessageId={formMessageId}
      >
        {children}
      </FormControl>

      {description && (
        <FormDescription id={formDescriptionId}>{description}</FormDescription>
      )}

      <FormMessage error={error} id={formMessageId} />
    </div>
  )
}

export { FormField }
