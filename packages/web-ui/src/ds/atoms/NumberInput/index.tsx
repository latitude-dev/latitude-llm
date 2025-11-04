'use client'
import { forwardRef } from 'react'
import { cn } from '../../../lib/utils'
import { FormField, FormFieldProps } from '../FormField'
import { Input } from '../Input'
import { NumberInputProps, useNumberInput } from './useNumberInput'

type Props = NumberInputProps &
  Omit<FormFieldProps, 'children'> & {
    fieldClassName?: string
  }

const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  {
    value,
    defaultValue,
    onChange,
    min = -Infinity,
    max = Infinity,
    fieldClassName,
    disabled,
    className,
    label,
    info,
    description,
    errors,
    errorStyle,
    ...props
  },
  ref,
) {
  const ni = useNumberInput({
    ref,
    value,
    defaultValue,
    onChange,
    min,
    max,
  })
  return (
    <FormField
      label={label}
      info={info}
      description={description}
      errors={errors}
      errorStyle={errorStyle}
      className={fieldClassName}
    >
      <div
        className={cn(
          'w-full flex items-center rounded-md outline-none',
          ni.focused && 'ring-ring ring-2 ring-offset-2',
          ni.focused && errors && 'ring-red-500',
          className,
        )}
      >
        <Input
          type='number'
          ref={ni.internalRef}
          value={ni.value}
          onChange={ni.onChange}
          onBlur={ni.onBlur}
          onFocus={ni.onFocus}
          max={max}
          min={min}
          className={cn('w-full relative focus-visible:ring-0', {
            'border-red-500': errors,
          })}
          disabled={disabled}
          {...props}
        />
      </div>
    </FormField>
  )
})

export { NumberInput }
