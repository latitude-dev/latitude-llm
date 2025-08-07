import { type RefObject, useEffect } from 'react'

export function useOnClickOutside<E extends HTMLElement>({
  enabled,
  ref,
  handler,
}: {
  enabled: boolean
  ref: RefObject<E>
  handler: (event: MouseEvent | TouchEvent) => void
}) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!(event.target instanceof Node)) return

      const insideWrapper = ref.current?.contains?.(event.target)
      if (insideWrapper) return

      handler(event)
    }

    if (!enabled) return

    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)

    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler, enabled])
}
