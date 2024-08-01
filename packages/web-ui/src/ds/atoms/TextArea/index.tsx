import { forwardRef, TextareaHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { FormField, type FormFieldProps } from '$ui/ds/atoms/FormField'
import { INPUT_BASE_CLASSES, INPUT_VARIANT_SIZE } from '$ui/ds/atoms/Input'
import { cn } from '$ui/lib/utils'
import TextareaAutosize, {
  type TextareaAutosizeProps,
} from 'react-textarea-autosize'

const inputVariants = cva(cn(INPUT_BASE_CLASSES), {
  variants: {
    size: {
      normal: INPUT_VARIANT_SIZE.normal,
      small: INPUT_VARIANT_SIZE.small,
    },
  },
  defaultVariants: {
    size: 'normal',
  },
})
export type TextAreaProps = TextareaAutosizeProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'height'> &
  VariantProps<typeof inputVariants> &
  Omit<FormFieldProps, 'children'>
const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    {
      className,
      label,
      errors,
      errorStyle,
      description,
      size,
      minRows = 5,
      maxRows,
      placeholder,
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
        <TextareaAutosize
          ref={ref}
          minRows={minRows}
          maxRows={maxRows}
          placeholder={placeholder}
          className={cn(inputVariants({ size }), className, {
            'border-red-500 focus-visible:ring-red-500': errors,
          })}
          {...props}
        />
      </FormField>
    )
  },
)

export { TextArea }
