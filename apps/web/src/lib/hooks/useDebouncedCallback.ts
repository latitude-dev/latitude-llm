import { useCallback, useRef } from "react"
import { useTimeoutFn } from "react-use"

export function useDebouncedCallback<T>(fn: (value: T) => void, delay: number): (value: T) => void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const pendingValueRef = useRef<{ value: T } | null>(null)

  const [, , reset] = useTimeoutFn(() => {
    const pending = pendingValueRef.current
    if (!pending) return

    pendingValueRef.current = null
    fnRef.current(pending.value)
  }, delay)

  return useCallback(
    (value: T) => {
      pendingValueRef.current = { value }
      reset()
    },
    [reset],
  )
}
