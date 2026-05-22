import { type DependencyList, useEffect, useRef } from "react"

/**
 * Runs `callback` after `delayMs` once `dependencies` stop changing.
 *
 * This intentionally mirrors the small subset of `react-use`'s `useDebounce`
 * API that the web app used, without pulling in its vulnerable js-cookie
 * transitive dependency.
 */
export function useDebounce(callback: () => void, delayMs: number, dependencies: DependencyList): void {
  const callbackRef = useRef(callback)

  // TODO(frontend-use-effect-policy): keep the latest callback available to the timer without resetting it every render.
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // TODO(frontend-use-effect-policy): debounce side effect with explicit caller-controlled dependencies.
  useEffect(() => {
    const timeout = window.setTimeout(() => callbackRef.current(), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs, ...dependencies])
}
