'use client'
import {
  ChangeEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '../../../lib/utils'
import { Text } from '../../atoms/Text'

export type RadioToggleOption<T> = {
  label: ReactNode | string
  value: T
  disabled?: boolean
}

function LabelText({
  isSelected,
  children,
}: {
  isSelected: boolean
  children: ReactNode | string
}) {
  if (typeof children === 'string') {
    return (
      <Text.H5 color={isSelected ? 'foreground' : 'foregroundMuted'}>
        {children}
      </Text.H5>
    )
  }
  return <>{children}</>
}

export function RadioToggleInput<T extends string>({
  name,
  options,
  value,
  disabled,
  onChange,
}: {
  name: string
  options: RadioToggleOption<T>[]
  value?: T
  onChange?: (value: T) => void
  disabled?: boolean
}) {
  const selectedOptionButtonRef = useRef<HTMLLabelElement>(null)
  const selectedOptionBackgroundRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(value)

  useEffect(() => {
    setSelected(value)
  }, [value])

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value as T
      setSelected(newValue)
      onChange?.(newValue)
    },
    [onChange],
  )

  useEffect(() => {
    const background = selectedOptionBackgroundRef.current
    if (!background) return

    const button = selectedOptionButtonRef.current
    if (!button) {
      background.style.display = 'none'
      return
    }

    const updateBackgroundPosition = () => {
      background.style.left = `${button.offsetLeft}px`
      background.style.width = `${button.offsetWidth}px`
      background.style.display = 'block'
    }

    updateBackgroundPosition()

    const resizeObserver = new ResizeObserver(updateBackgroundPosition)
    resizeObserver.observe(button)

    return () => resizeObserver.disconnect()
  }, [selected])

  return (
    <div
      className={cn(
        'flex flex-row h-8 px-0.5 bg-secondary rounded-lg border border-border relative w-fit',
      )}
    >
      <div
        className={cn(
          'absolute hidden bg-background rounded-md shadow-sm top-0.5 bottom-0.5 border border-border',
          'transition-all duration-200 ease-in-out',
        )}
        ref={selectedOptionBackgroundRef}
      />
      {options.map((option) => {
        const isSelected = selected === option.value
        return (
          <label
            key={option.value}
            ref={isSelected ? selectedOptionButtonRef : null}
            className={cn(
              'relative flex items-center justify-center cursor-pointer',
              'px-3 h-8 rounded-lg transition-colors',
              (disabled || option.disabled) && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type='radio'
              name={name}
              value={option.value}
              checked={isSelected}
              onChange={handleChange}
              disabled={disabled || option.disabled}
              className='sr-only'
            />
            <LabelText isSelected={isSelected}>{option.label}</LabelText>
          </label>
        )
      })}
    </div>
  )
}
