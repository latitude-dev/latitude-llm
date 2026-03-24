import { useMountEffect } from "@repo/ui"
import { useCallback, useRef } from "react"

export function useDebouncedCallback<T>(fn: (value: T) => void, delay: number): (value: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useMountEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  })

  return useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fnRef.current(value), delay)
    },
    [delay],
  )
}
