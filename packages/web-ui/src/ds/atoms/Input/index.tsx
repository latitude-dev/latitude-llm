import { forwardRef, InputHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { FormField, type FormFieldProps } from '$ui/ds/atoms/FormField'
import { font } from '$ui/ds/tokens'
import { cn } from '$ui/lib/utils'

const inputVariants = cva(
  cn(
    'flex w-full border border-input bg-background ring-offset-background',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground',
    'focus-visible:outline-none focus-visible:ring-ring rounded-md focus-visible:ring-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    font.size.h5,
  ),
  {
    variants: {
      size: {
        normal: 'h-8 px-2 py-1  focus-visible:ring-offset-2',
        small: 'px-1 rounded-sm focus-visible:ring-offset-1',
      },
    },
    defaultVariants: {
      size: 'normal',
    },
  },
)
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  VariantProps<typeof inputVariants> &
  Omit<FormFieldProps, 'children'> & {
    artificialFocused?: boolean
  }
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    artificialFocused = false,
    className,
    label,
    errors,
    errorStyle,
    description,
    type,
    size,
    ...props
  },
  ref,
) {
  return (
    <FormField
      label={label}
      description={description}
      errors={errors}
      errorStyle={errorStyle}
    >
      <input
        ref={ref}
        type={type}
        className={cn(inputVariants({ size }), className, {
          'border-red-500 focus-visible:ring-red-500': errors,
          'ring-2': artificialFocused,
          'ring-ring': artificialFocused && !errors,
          'ring-red-500': artificialFocused && errors,
          'ring-offset-2': artificialFocused && size === 'normal',
          'ring-offset-1': artificialFocused && size === 'small',
        })}
        {...props}
      />
    </FormField>
  )
})

export { Input }
