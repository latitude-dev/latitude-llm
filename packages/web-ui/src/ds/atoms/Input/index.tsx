import { forwardRef, InputHTMLAttributes } from 'react'

import { FormField, type FormFieldProps } from '$ui/ds/atoms/FormField'
import { font } from '$ui/ds/tokens'
import { cn } from '$ui/lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  Omit<FormFieldProps, 'children'>
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, errors, description, type, ...props },
  ref,
) {
  return (
    <FormField label={label} description={description} errors={errors}>
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          font.size.h5,
          className,
          {
            'border-red-500 focus-visible:ring-red-500': errors,
          },
        )}
        {...props}
      />
    </FormField>
  )
})

export { Input }
