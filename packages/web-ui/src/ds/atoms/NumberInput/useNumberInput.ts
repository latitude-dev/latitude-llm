import {
  ChangeEvent,
  Ref,
  KeyboardEvent as SyntheticKeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { InputProps } from '../Input'

function buildValue(value: number | undefined, min: number, max: number) {
  if (value === undefined) return undefined
  return Math.min(Math.max(value, min), max)
}

export type NumberInputProps = {
  value?: number
  defaultValue?: number
  onChange?: (value: number | undefined) => void
  min?: number
  max?: number
} & Omit<
  InputProps,
  'defaultValue' | 'value' | 'onChange' | 'min' | 'max' | 'type'
>

export function useNumberInput({
  ref,
  value: controlledValue,
  defaultValue,
  onChange,
  min = -Infinity,
  max = Infinity,
}: NumberInputProps & { ref?: Ref<HTMLInputElement> }) {
  const isControlledRef = useRef(controlledValue !== undefined)
  if (controlledValue !== undefined) {
    isControlledRef.current = true
  }
  const isControlled = isControlledRef.current
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const currentValue = isControlled ? controlledValue : uncontrolledValue

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const internalRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  const updateValue = useCallback(
    (next: number | undefined) => {
      const bounded = buildValue(next, min, max)
      if (!isControlled) {
        setUncontrolledValue(bounded)
      }
      onChangeRef.current?.(bounded)
    },
    [isControlled, min, max],
  )

  const increment = useCallback(() => {
    const next = Math.min((currentValue ?? 0) + 1, max)
    updateValue(next)
  }, [currentValue, max, updateValue])

  const decrement = useCallback(() => {
    const next = Math.max((currentValue ?? 0) - 1, min)
    updateValue(next)
  }, [currentValue, min, updateValue])

  const onFocus = useCallback(() => setFocused(true), [])
  const onBlur = useCallback(() => {
    setFocused(false)
    if (currentValue !== undefined) {
      updateValue(currentValue)
    }
  }, [currentValue, updateValue])

  const onChangeInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = parseInt(event.target.value, 10)
      updateValue(isNaN(parsed) ? undefined : parsed)
    },
    [updateValue],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent | SyntheticKeyboardEvent<HTMLInputElement>) => {
      if (document.activeElement !== internalRef.current) return
      switch (event.key) {
        case 'Enter':
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
    [increment, decrement],
  )

  const onFocusControl = useCallback(() => {
    internalRef.current?.focus()
  }, [])

  useImperativeHandle(ref, () => internalRef.current!)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    window.addEventListener('keydown', handleKeyDown, { signal })
    return () => controller.abort()
  }, [handleKeyDown])

  return useMemo(
    () => ({
      value: currentValue,
      setValue: updateValue,
      focused,
      increment,
      decrement,
      onFocus,
      onBlur,
      onChange: onChangeInput,
      onFocusControl,
      internalRef,
    }),
    [
      currentValue,
      updateValue,
      focused,
      increment,
      decrement,
      onFocus,
      onBlur,
      onChangeInput,
      onFocusControl,
    ],
  )
}
