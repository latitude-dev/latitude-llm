import { forwardRef, useEffect, useState } from 'react'
import { Skeleton } from '../../atoms/Skeleton'
import { FormField } from '../../atoms/FormField'
import { MultiSelect, MultiSelectProps } from '../MultiSelect'

interface MultiSelectInputProps
  extends MultiSelectProps,
    Omit<typeof FormField, 'children'> {
  required?: boolean
  description?: string
  info?: string
  label?: string
  name?: string
  badgeLabel?: boolean
  errors?: string[]
  loading?: boolean
}

export const MultiSelectInput = forwardRef<
  HTMLButtonElement,
  MultiSelectInputProps
>(
  (
    {
      options,
      onChange,
      value,
      defaultValue,
      placeholder,
      animation,
      maxCount,
      modalPopover,
      className,
      disabled,
      size,
      trigger,
      // FormField props
      required,
      description,
      info,
      label,
      name,
      badgeLabel,
      errors,
      loading,
      ...props
    },
    ref,
  ) => {
    const [selectedValues, setSelectedValues] = useState<string[]>(
      value || defaultValue || [],
    )

    // Sync with controlled value
    useEffect(() => {
      if (value !== undefined) {
        setSelectedValues(value)
      }
    }, [value])

    // Handle changes from MultiSelect
    const handleChange = (newValues: string[]) => {
      setSelectedValues(newValues)
      onChange?.(newValues)
    }

    useEffect(() => {
      const form = document.querySelector('form')
      if (form && name) {
        const handleSubmit = (e: Event) => {
          const formData = new FormData(e.target as HTMLFormElement)
          formData.set(name, JSON.stringify(selectedValues))
        }
        form.addEventListener('submit', handleSubmit)
        return () => form.removeEventListener('submit', handleSubmit)
      }
    }, [name, selectedValues])

    if (loading) {
      return (
        <FormField
          badgeLabel={badgeLabel}
          label={label}
          info={info}
          description={description}
          errors={errors}
        >
          <Skeleton className='w-full h-8 rounded-md' />
        </FormField>
      )
    }

    return (
      <FormField
        badgeLabel={badgeLabel}
        label={label}
        info={info}
        description={description}
        errors={errors}
      >
        <div>
          <input
            required={required}
            type='hidden'
            name={name}
            value={JSON.stringify(selectedValues)}
          />
          <MultiSelect
            ref={ref}
            {...props}
            options={options}
            onChange={handleChange}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            animation={animation}
            maxCount={maxCount}
            modalPopover={modalPopover}
            className={className}
            disabled={disabled}
            size={size}
            trigger={trigger}
          />
        </div>
      </FormField>
    )
  },
)

MultiSelectInput.displayName = 'MultiSelectInput'
