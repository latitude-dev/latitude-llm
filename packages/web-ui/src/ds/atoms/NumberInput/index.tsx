'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Button, FormField, Input, InputProps, type FormFieldProps } from '..'
import { cn } from '../../../lib/utils'

export type NumberInputProps = {
  value?: number
  onChange?: (value: number | undefined) => void
  min?: number
  max?: number
  defaultAppearance?: boolean
} & Omit<
  InputProps,
  'defaultValue' | 'value' | 'onChange' | 'min' | 'max' | 'type'
> &
  Omit<FormFieldProps, 'children'>

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      value: defaultValue,
      onChange,
      min = -Infinity,
      max = Infinity,
      defaultAppearance,
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
    const [value, setValue] = useState(defaultValue)
    useEffect(() => {
      if (value === undefined) onChange?.(undefined)
      else onChange?.(Math.min(Math.max(value, min), max))
    }, [value, min, max])

    const internalRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(ref, () => internalRef.current!)

    const [focused, setFocused] = useState(false)

    const increment = useCallback(() => {
      setValue((prev) => Math.min((prev ?? 0) + 1, max))
    }, [max])

    const decrement = useCallback(() => {
      setValue((prev) => Math.max((prev ?? 0) - 1, min))
    }, [min])

    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (!internalRef?.current) return
        if (document.activeElement !== internalRef.current) return
        switch (event.key) {
          case 'Enter':
            event.preventDefault()
            increment()
            break
          case 'ArrowUp':
            event.preventDefault()
            increment()
            break
          case 'ArrowDown':
            event.preventDefault()
            decrement()
            break
        }
      },
      [internalRef, increment, decrement],
    )

    useEffect(() => {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    return (
      <FormField
        label={label}
        info={info}
        description={description}
        errors={errors}
        errorStyle={errorStyle}
      >
        <div
          className={cn(
            'w-full flex items-center rounded-md outline-none',
            focused && 'ring-ring ring-2 ring-offset-2',
            className,
          )}
        >
          <Input
            value={value !== undefined && !isNaN(value) ? value : ''}
            onChange={(event) => {
              const parsed = parseInt(event.target.value, 10)
              if (isNaN(parsed)) setValue(undefined)
              else setValue(parsed)
            }}
            onBlur={() => {
              setFocused(false)
              if (value === undefined) return
              setValue(Math.min(Math.max(value, min), max))
            }}
            onFocus={() => setFocused(true)}
            type='number'
            max={max}
            min={min}
            className={cn('w-full relative focus-visible:ring-0', {
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none rounded-r-none':
                !defaultAppearance,
            })}
            ref={internalRef}
            disabled={disabled}
            {...props}
          />
          {!defaultAppearance && (
            <div className='flex flex-col'>
              <Button
                aria-label='Increase value'
                className='px-2 h-4 rounded-l-none rounded-br-none border-l-0 focus-visible:relative focus-visible:ring-0'
                variant='outline'
                iconProps={{
                  name: 'chevronUp',
                  color: 'foregroundMuted',
                }}
                onClick={(event) => {
                  event.preventDefault()
                  increment()
                }}
                onBlur={() => setFocused(false)}
                onFocus={() => setFocused(true)}
                disabled={disabled || (value !== undefined && value >= max)}
              />
              <Button
                aria-label='Decrease value'
                className='px-2 h-4 rounded-l-none rounded-tr-none border-l-0 border-t-0 focus-visible:relative focus-visible:ring-0'
                variant='outline'
                iconProps={{
                  name: 'chevronDown',
                  color: 'foregroundMuted',
                }}
                onClick={(event) => {
                  event.preventDefault()
                  decrement()
                }}
                onBlur={() => setFocused(false)}
                onFocus={() => setFocused(true)}
                disabled={disabled || (value !== undefined && value <= min)}
              />
            </div>
          )}
        </div>
      </FormField>
    )
  },
)

export { NumberInput }
