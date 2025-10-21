import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  useCallback,
  Ref,
  KeyboardEvent as SyntheticKeyboardEvent,
  ChangeEvent,
  useMemo,
} from 'react'
import { InputProps } from '../Input'

function buildValue(value: number | undefined, min: number, max: number) {
  if (value === undefined) return undefined
  return Math.min(Math.max(value, min), max)
}

export type NumberInputProps = {
  value?: number
  onChange?: (value: number | undefined) => void
  min?: number
  max?: number
} & Omit<
  InputProps,
  'defaultValue' | 'value' | 'onChange' | 'min' | 'max' | 'type'
>
export function useNumberInput({
  ref,
  value: defaultValue,
  onChange,
  min = -Infinity,
  max = Infinity,
}: NumberInputProps & { ref?: Ref<HTMLInputElement> }) {
  const [value, setValue] = useState(defaultValue)
  const onChangeRef = useRef(onChange)
  // Keep the ref up to date with the latest onChange function
  // TODO: Replace with useEffectEvent when we upgrade to React 19.2.2
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const internalRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const newValue = buildValue(value, min, max)
    onChangeRef.current?.(newValue)
  }, [value, min, max])
  const increment = useCallback(() => {
    setValue((prev) => Math.min((prev ?? 0) + 1, max))
  }, [max])

  const decrement = useCallback(() => {
    setValue((prev) => Math.max((prev ?? 0) - 1, min))
  }, [min])

  const onFocus = useCallback(() => {
    setFocused(true)
  }, [])
  const onBlur = useCallback(() => {
    setFocused(false)
    if (value === undefined) return

    // Ensure the value is within bounds when losing focus
    setValue((prev) => buildValue(prev, min, max))
  }, [min, max, value])
  const onChangeInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseInt(event.target.value, 10)
    if (isNaN(parsed)) setValue(undefined)
    else setValue(parsed)
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent | SyntheticKeyboardEvent<HTMLInputElement>) => {
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

  const onFocusControl = useCallback(() => {
    internalRef.current?.focus()
  }, [])
  useImperativeHandle(ref, () => internalRef.current!)

  // Sync internal value with external defaultValue
  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    window.addEventListener('keydown', handleKeyDown, { signal })

    return () => controller.abort()
  }, [handleKeyDown])

  return useMemo(
    () => ({
      focused,
      setFocused,
      value,
      setValue,
      increment,
      decrement,
      internalRef,
      onFocus,
      onFocusControl,
      onBlur,
      onChange: onChangeInput,
    }),
    [
      focused,
      setFocused,
      onFocusControl,
      value,
      setValue,
      increment,
      decrement,
      internalRef,
      onFocus,
      onBlur,
      onChangeInput,
    ],
  )
}
