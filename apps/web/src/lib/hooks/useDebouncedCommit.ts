import { useMountEffect } from "@repo/ui"
import { useEffect, useRef } from "react"

/**
 * Debounces `pending` into `onCommit`, and commits whatever is still uncommitted when the
 * component unmounts.
 *
 * `null` means "nothing pending"; every other value — `undefined` included — is a real edit
 * waiting to be written. The unmount flush is the point of the hook: anything that removes
 * the input from the React tree mid-debounce (collapsing its section, closing the filters
 * sidebar, switching a range/percentile tab, filtering sections out of a search) would
 * otherwise discard what the user already typed.
 */
export function useDebouncedCommit<T>(pending: T | null, onCommit: (value: T) => void, delayMs: number): void {
  const commitRef = useRef(onCommit)
  const uncommittedRef = useRef<T | null>(pending)

  // TODO(frontend-use-effect-policy): keep the latest callback reachable from the timer and the unmount flush.
  useEffect(() => {
    commitRef.current = onCommit
  }, [onCommit])

  // TODO(frontend-use-effect-policy): debounced side effect keyed on the pending value.
  useEffect(() => {
    uncommittedRef.current = pending
    if (pending === null) return
    const timeout = window.setTimeout(() => {
      uncommittedRef.current = null
      commitRef.current(pending)
    }, delayMs)
    return () => window.clearTimeout(timeout)
  }, [pending, delayMs])

  useMountEffect(() => () => {
    const uncommitted = uncommittedRef.current
    if (uncommitted === null) return
    uncommittedRef.current = null
    commitRef.current(uncommitted)
  })
}
