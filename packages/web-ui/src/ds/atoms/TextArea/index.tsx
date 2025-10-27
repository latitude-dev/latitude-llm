import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, TextareaHTMLAttributes } from 'react'
import TextareaAutosize, {
  type TextareaAutosizeProps,
} from 'react-textarea-autosize'
import { cn } from '../../../lib/utils'
import { FormField, type FormFieldProps } from '../FormField'
import { INPUT_BASE_CLASSES, INPUT_VARIANT_SIZE } from '../Input'
import { Skeleton } from '../Skeleton'

const inputVariants = cva('', {
  variants: {
    variant: {
      default: INPUT_BASE_CLASSES,
      unstyled: '',
    },
    size: {
      normal: INPUT_VARIANT_SIZE.normal,
      small: INPUT_VARIANT_SIZE.small,
      none: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'normal',
  },
})

export type TextAreaProps = TextareaAutosizeProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'height'> &
  VariantProps<typeof inputVariants> &
  Omit<FormFieldProps, 'children' | 'onKeyDown' | 'onFocus'> & {
    autoGrow?: boolean
    loading?: boolean
  }
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
      autoGrow = false,
      variant = 'default',
      loading = false,
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
        autoGrow={autoGrow}
      >
        {loading ? (
          <Skeleton className='w-full h-8 rounded-md' />
        ) : (
          <TextareaAutosize
            ref={ref}
            minRows={minRows}
            maxRows={maxRows}
            placeholder={placeholder}
            className={cn(
              inputVariants({ variant, size }),
              'custom-scrollbar',
              {
                'border-red-500 focus-visible:ring-red-500': errors,
                // Account for inner textarea padding
                '!min-h-[calc(100%-theme(spacing.6))]': autoGrow,
              },
              className,
            )}
            {...props}
          />
        )}
      </FormField>
    )
  },
)

export { TextArea }
