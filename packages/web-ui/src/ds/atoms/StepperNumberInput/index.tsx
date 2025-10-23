'use client'
import { HtmlHTMLAttributes, Ref } from 'react'
import { cn } from '../../../lib/utils'
import { NumberInputProps, useNumberInput } from '../NumberInput/useNumberInput'
import { Icon } from '../Icons'

const BUTTON_BASE_CLASSES = cn(
  'h-7 w-7 flex items-center justify-center',
  'focus-visible:ring-0 focus-visible:ring-none focus-visible:ring-offset-0',
  'foucs:outline-none',
  'focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
  'disabled:cursor-not-allowed disabled:opacity-50',
)
type Props = Omit<HtmlHTMLAttributes<HTMLInputElement>, 'onChange'> &
  NumberInputProps & {
    ref?: Ref<HTMLInputElement>
  }
export function StepperNumberInput({
  ref,
  name,
  value: defaultValue,
  onChange,
  min = -Infinity,
  max = Infinity,
  disabled,
}: Props) {
  const badge = useNumberInput({
    ref,
    value: defaultValue,
    onChange,
    min,
    max,
  })
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl bg-muted',
        'focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0',
      )}
    >
      {/* Decrement Button */}
      <button
        tabIndex={-1}
        onFocus={badge.onFocusControl}
        aria-label='Decrease value'
        type='button'
        className={BUTTON_BASE_CLASSES}
        onClick={badge.decrement}
        disabled={disabled || (badge.value !== undefined && badge.value <= min)}
      >
        <Icon name='minus' />
      </button>

      {/* Number Display */}
      <div className='flex items-center justify-center'>
        <input
          tabIndex={0}
          name={name}
          type='number'
          ref={badge.internalRef}
          placeholder='-'
          value={
            badge.value !== undefined && !isNaN(badge.value) ? badge.value : ''
          }
          onChange={badge.onChange}
          onBlur={badge.onBlur}
          onFocus={badge.onFocus}
          max={max}
          min={min}
          className={cn(
            'text-center border-0 bg-transparent px-1',
            'text-sm font-medium rounded-lg bg-background',
            'focus-visible:ring-0 outline-none focus-visible:ring-offset-0',
            '"appearance-none [-moz-appearance:textfield]',
            '[&::-webkit-outer-spin-button]:appearance-none',
            '[&::-webkit-inner-spin-button]:appearance-none',
          )}
          disabled={disabled}
        />
      </div>

      {/* Increment Button */}
      <button
        tabIndex={-1}
        onFocus={badge.onFocusControl}
        aria-label='Increase value'
        type='button'
        className={BUTTON_BASE_CLASSES}
        onClick={badge.increment}
        disabled={disabled || (badge.value !== undefined && badge.value >= max)}
      >
        <Icon name='plus' />
      </button>
    </div>
  )
}
