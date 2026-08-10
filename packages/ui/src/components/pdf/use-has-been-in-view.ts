import type { RefObject } from "react"
import { useEffect, useState } from "react"

function nearestScrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === "auto" || overflowY === "scroll") return node
  }
  return null
}

/**
 * Whether the element has ever come within `rootMargin` of its scrollport. Latches on, so gating a
 * lazy render on it never unloads what the reader has already scrolled to.
 */
export function useHasBeenInView(ref: RefObject<HTMLElement | null>, rootMargin = "0px"): boolean {
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (seen) return

    // Deliberately not feature-detected during render: the server and the client's first paint have
    // to agree. Without an observer everything counts as visible.
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true)
      return
    }

    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true)
      },
      // An inner scrollport clips the target before `rootMargin` widens the viewport, so preloading
      // ahead of the scroll only works with that scrollport as the root.
      { root: nearestScrollParent(element), rootMargin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, rootMargin, seen])

  return seen
}
