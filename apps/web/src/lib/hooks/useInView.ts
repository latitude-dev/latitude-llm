import { useCallback, useRef, useState } from "react"

/**
 * Reports when an element first scrolls into view (sticky once seen). Uses a
 * callback ref so the observer wires up the moment the node mounts. `rootMargin`
 * expands the viewport to prefetch slightly ahead; intermediate scroll
 * containers are clipped automatically, so a viewport root works inside nested
 * `overflow` containers.
 */
export function useInView<T extends Element>({ rootMargin = "0px" }: { rootMargin?: string } = {}) {
  const [inView, setInView] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      if (!node) return
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setInView(true)
            observer.disconnect()
            observerRef.current = null
          }
        },
        { rootMargin },
      )
      observer.observe(node)
      observerRef.current = observer
    },
    [rootMargin],
  )

  return [ref, inView] as const
}
